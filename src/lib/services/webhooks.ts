/**
 * Webhook intake and processing.
 *
 * Two endpoints in total, as the spec asks for: the existing platform endpoint,
 * which now also receives refund and dispute events, and a new Connect endpoint
 * with its own signing secret. Nothing here touches the subscription flow.
 *
 * Safety comes from three things, not from trusting Stripe to deliver once:
 *   1. every event is stored by its own id, so a replay is recognised
 *   2. each handler re-reads state and returns early if the work is done
 *   3. anything that creates a document carries an idempotency key
 *
 * That combination also covers out-of-order delivery: a refund arriving before
 * the sale it belongs to parks itself rather than corrupting the ledger.
 */
import { prisma } from '@/lib/db';
import { euro, planReversal, settleCarriedBalance, shareCost } from '@/domain/money';
import {
  InsufficientBalanceError,
  reverseTransfer,
  stripeFeeFor,
  STRIPE_PRICING,
  type PaymentMethod,
  type StripeEvent,
} from '@/lib/stripe/mock';
import { issueCreditNote, issueSaleInvoice } from './invoicing';

export interface ProcessOutcome {
  eventId: string;
  type: string;
  status: 'processed' | 'ignored' | 'already-processed' | 'deferred';
  note: string;
}

/** Store first, process second. A crash between the two replays safely. */
export async function receive(event: StripeEvent): Promise<ProcessOutcome> {
  const existing = await prisma.webhookEvent.findUnique({ where: { id: event.id } });
  if (!existing) {
    await prisma.webhookEvent.create({
      data: {
        id: event.id,
        type: event.type,
        endpoint: event.endpoint,
        payload: event as unknown as object,
      },
    });
  }
  return process(event.id);
}

/** Re-running this for an id that is already done must change nothing. */
export async function process(eventId: string): Promise<ProcessOutcome> {
  const record = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });
  const event = record.payload as unknown as StripeEvent;
  const object = event.data.object as Record<string, never> & Record<string, unknown>;

  const done = (status: ProcessOutcome['status'], note: string) => ({
    eventId,
    type: record.type,
    status,
    note,
  });

  let outcome: ProcessOutcome;

  switch (record.type) {
    case 'checkout.session.completed':
      outcome = await onCheckoutCompleted(object, done);
      break;
    case 'charge.refunded':
      outcome = await onRefund(object, done);
      break;
    case 'charge.dispute.created':
      outcome = await onDisputeOpened(object, done);
      break;
    case 'charge.dispute.closed':
      outcome = await onDisputeClosed(object, done);
      break;
    case 'account.updated':
      outcome = await onAccountUpdated(object, done);
      break;
    default:
      outcome = done('ignored', 'No handler for this event type.');
  }

  await prisma.webhookEvent.update({
    where: { id: eventId },
    data: { processedAt: new Date(), note: outcome.note },
  });

  return outcome;
}

export async function replay(eventId: string): Promise<ProcessOutcome> {
  await prisma.webhookEvent.update({ where: { id: eventId }, data: { replayCount: { increment: 1 } } });
  return process(eventId);
}

type Done = (status: ProcessOutcome['status'], note: string) => ProcessOutcome;

/* ------------------------------------------------------------- handlers */

async function onCheckoutCompleted(object: Record<string, unknown>, done: Done): Promise<ProcessOutcome> {
  const sessionId = String(object.id);
  const purchase = await prisma.purchase.findUnique({ where: { checkoutSessionId: sessionId } });
  if (!purchase) return done('deferred', 'No purchase for this session yet; safe to replay once it exists.');
  if (purchase.status !== 'PENDING') return done('already-processed', 'This sale is already recorded.');

  const config = await prisma.config.findFirstOrThrow();
  const designer = await prisma.designer.findUniqueOrThrow({ where: { id: purchase.designerId } });

  const holdDays = designer.holdDaysOverride ?? config.defaultHoldDays;
  const holdUntil = new Date(Date.now() + holdDays * 86_400_000);

  // An outstanding balance from an earlier reversal is taken off this payout
  // before anything leaves for the designer.
  const settlement = settleCarriedBalance(purchase.transferCents, designer.carriedBalanceCents);

  const updated = await prisma.purchase.update({
    where: { id: purchase.id },
    data: {
      status: 'PAID',
      chargeId: String(object.charge),
      transferId: `tr_for_${String(object.charge)}`,
      payoutHoldUntil: holdUntil,
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      purchaseId: purchase.id,
      designerId: designer.id,
      type: 'TRANSFER',
      amountCents: purchase.transferCents,
      reasonKey: 'sale.transfer',
      reasonParams: { share: purchase.designerShareBp / 100, vat: purchase.vatRateBp / 100 },
      stripeObjectId: String(object.charge),
    },
  });

  if (settlement.settledCents > 0) {
    await prisma.ledgerEntry.create({
      data: {
        purchaseId: purchase.id,
        designerId: designer.id,
        type: 'BALANCE_SETTLEMENT',
        amountCents: -settlement.settledCents,
        reasonKey: 'balance.settled',
      },
    });
    await prisma.designer.update({
      where: { id: designer.id },
      data: { carriedBalanceCents: settlement.remainingBalanceCents },
    });
  }

  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: purchase.listingId } });
  const invoice = await issueSaleInvoice(updated, listing.title);

  return done(
    'processed',
    `Sale recorded, payout held until ${holdUntil.toLocaleDateString('nl-NL')}. Invoice ${invoice.fullNumber}${invoice.created ? '' : ' (already existed)'}.`,
  );
}

async function onRefund(object: Record<string, unknown>, done: Done): Promise<ProcessOutcome> {
  const refundId = String(object.id);
  const chargeId = String(object.charge);
  const refundCents = Number(object.amount);

  const purchase = await prisma.purchase.findUnique({ where: { chargeId } });
  if (!purchase) return done('deferred', 'Refund arrived before the sale; safe to replay.');

  // The credit note is the idempotency marker for the whole refund: if it is
  // already there, this exact refund has been handled.
  const already = await prisma.document.findUnique({
    where: { idempotencyKey: `CREDIT_NOTE:${refundId}` },
  });
  if (already) return done('already-processed', `Refund already settled, credit note ${already.fullNumber}.`);

  const designer = await prisma.designer.findUniqueOrThrow({ where: { id: purchase.designerId } });

  const plan = planReversal(refundCents, purchase);

  // Stripe keeps its processing fee on a refund. That retained cost rides the
  // same commission split as the sale did.
  const retainedFee = stripeFeeFor(refundCents, purchase.paymentMethod as PaymentMethod);
  const costs = shareCost(retainedFee, purchase.designerShareBp);

  const alreadyPaidOut = Boolean(purchase.paidOutAt);
  let reversedCents = 0;
  let carried = 0;

  try {
    reverseTransfer(purchase.transferId!, plan.reversalCents, alreadyPaidOut);
    reversedCents = plan.reversalCents;
    await prisma.ledgerEntry.create({
      data: {
        purchaseId: purchase.id,
        designerId: designer.id,
        type: 'REVERSAL',
        amountCents: -reversedCents,
        reasonKey: 'refund.reversal',
        reasonParams: { amount: euro(refundCents) },
        stripeObjectId: refundId,
      },
    });
  } catch (error) {
    if (!(error instanceof InsufficientBalanceError)) throw error;
    // Money has already reached the designer's bank. Carry it and take it off
    // the next sale rather than leaving the platform short.
    carried = plan.reversalCents;
    await prisma.ledgerEntry.create({
      data: {
        purchaseId: purchase.id,
        designerId: designer.id,
        type: 'BALANCE_CARRIED',
        amountCents: -carried,
        reasonKey: 'refund.carried',
        stripeObjectId: refundId,
      },
    });
  }

  await prisma.ledgerEntry.create({
    data: {
      purchaseId: purchase.id,
      designerId: designer.id,
      type: 'SHARED_COST',
      amountCents: -costs.designerCents,
      reasonKey: 'refund.sharedFee',
      reasonParams: { share: purchase.designerShareBp / 100, amount: euro(retainedFee) },
      stripeObjectId: refundId,
    },
  });

  const refundedTotal = purchase.refundedCents + refundCents;
  await prisma.purchase.update({
    where: { id: purchase.id },
    data: {
      refundedCents: refundedTotal,
      reversedCents: purchase.reversedCents + reversedCents,
      sharedCostCents: purchase.sharedCostCents + costs.designerCents,
      status: refundedTotal >= purchase.grossCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
    },
  });

  if (carried > 0) {
    await prisma.designer.update({
      where: { id: designer.id },
      data: { carriedBalanceCents: designer.carriedBalanceCents + carried + costs.designerCents },
    });
  }

  const note = await issueCreditNote(
    purchase,
    plan.reversalCents,
    refundId,
    'Terugbetaling van de oorspronkelijke verkoop',
  );

  return done(
    'processed',
    `Refund settled. Credit note ${note.fullNumber}. ${carried > 0 ? `Carried ${(carried / 100).toFixed(2)} EUR to the next sale.` : `Reversed ${(reversedCents / 100).toFixed(2)} EUR.`}`,
  );
}

async function onDisputeOpened(object: Record<string, unknown>, done: Done): Promise<ProcessOutcome> {
  const purchase = await prisma.purchase.findUnique({ where: { chargeId: String(object.charge) } });
  if (!purchase) return done('deferred', 'Dispute arrived before the sale; safe to replay.');
  if (purchase.status === 'DISPUTE_OPEN') return done('already-processed', 'Dispute already open.');

  await prisma.purchase.update({ where: { id: purchase.id }, data: { status: 'DISPUTE_OPEN' } });
  await prisma.designer.update({
    where: { id: purchase.designerId },
    data: { payoutsOnHold: true, holdReason: `Dispute opened on ${purchase.chargeId}` },
  });
  await prisma.ledgerEntry.create({
    data: {
      purchaseId: purchase.id,
      designerId: purchase.designerId,
      type: 'DISPUTE_HOLD',
      amountCents: -purchase.transferCents,
      reasonKey: 'dispute.hold',
      stripeObjectId: String(object.id),
    },
  });

  return done('processed', 'Share reversed, payouts on hold.');
}

async function onDisputeClosed(object: Record<string, unknown>, done: Done): Promise<ProcessOutcome> {
  const purchase = await prisma.purchase.findUnique({ where: { chargeId: String(object.charge) } });
  if (!purchase) return done('deferred', 'Dispute close arrived before the sale; safe to replay.');
  if (purchase.status === 'DISPUTE_WON' || purchase.status === 'DISPUTE_LOST') {
    return done('already-processed', 'Dispute outcome already recorded.');
  }

  const won = String(object.status) === 'won';

  if (won) {
    await prisma.purchase.update({ where: { id: purchase.id }, data: { status: 'DISPUTE_WON' } });
    await prisma.designer.update({
      where: { id: purchase.designerId },
      data: { payoutsOnHold: false, holdReason: null },
    });
    await prisma.ledgerEntry.create({
      data: {
        purchaseId: purchase.id,
        designerId: purchase.designerId,
        type: 'DISPUTE_RELEASE',
        amountCents: purchase.transferCents,
        reasonKey: 'dispute.release',
        stripeObjectId: String(object.id),
      },
    });
    return done('processed', 'Dispute won, share restored and hold lifted.');
  }

  const costs = shareCost(STRIPE_PRICING.disputeFeeCents, purchase.designerShareBp);
  await prisma.purchase.update({
    where: { id: purchase.id },
    data: {
      status: 'DISPUTE_LOST',
      disputeFeeCents: STRIPE_PRICING.disputeFeeCents,
      sharedCostCents: purchase.sharedCostCents + costs.designerCents,
      reversedCents: purchase.transferCents,
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      purchaseId: purchase.id,
      designerId: purchase.designerId,
      type: 'SHARED_COST',
      amountCents: -costs.designerCents,
      reasonKey: 'dispute.sharedFee',
      reasonParams: { amount: euro(STRIPE_PRICING.disputeFeeCents) },
      stripeObjectId: String(object.id),
    },
  });
  await prisma.designer.update({
    where: { id: purchase.designerId },
    data: { payoutsOnHold: false, holdReason: null },
  });

  const note = await issueCreditNote(
    purchase,
    purchase.transferCents,
    String(object.id),
    'Verloren chargeback op de oorspronkelijke verkoop',
  );

  return done('processed', `Dispute lost. Cost shared, credit note ${note.fullNumber}.`);
}

async function onAccountUpdated(object: Record<string, unknown>, done: Done): Promise<ProcessOutcome> {
  const accountId = String(object.id);
  const designer = await prisma.designer.findUnique({ where: { stripeAccountId: accountId } });
  if (!designer) return done('ignored', 'Account is not one of ours.');

  const charges = Boolean(object.charges_enabled);
  const payouts = Boolean(object.payouts_enabled);
  const submitted = Boolean(object.details_submitted);
  const requirements = object.requirements as { currently_due: string[]; disabled_reason: string | null };

  const status = !submitted
    ? 'INCOMPLETE'
    : requirements.disabled_reason === 'under_review'
      ? 'UNDER_REVIEW'
      : payouts
        ? 'READY'
        : charges || requirements.currently_due.length > 0
          ? 'INCOMPLETE'
          : 'RESTRICTED';

  await prisma.designer.update({
    where: { id: designer.id },
    data: {
      connectStatus: status,
      chargesEnabled: charges,
      payoutsEnabled: payouts,
      detailsSubmitted: submitted,
      requirementsDue: requirements.currently_due,
    },
  });

  return done('processed', `${designer.studioName} is now ${status}.`);
}
