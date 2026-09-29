'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { SaleRefusedError, startCheckout } from '@/lib/services/checkout';
import { completeSession, createRefund, openDispute, closeDispute, advanceAccount, newEvent, type PaymentMethod, type StripeDispute, type AccountStage } from '@/lib/stripe/mock';
import { receive, replay } from '@/lib/services/webhooks';

export async function buy(formData: FormData) {
  const listingId = String(formData.get('listingId'));
  const method = String(formData.get('method') || 'ideal') as PaymentMethod;

  try {
    const { purchase } = await startCheckout({
      listingId,
      buyerName: String(formData.get('buyerName') || 'Demo Koper'),
      buyerEmail: String(formData.get('buyerEmail') || 'koper@example.nl'),
      method,
    });
    redirect(`/checkout/${purchase.id}`);
  } catch (error) {
    if (error instanceof SaleRefusedError) {
      redirect(`/ontwerp/${formData.get('slug')}?refused=${encodeURIComponent(error.reasons.join(' · '))}`);
    }
    throw error;
  }
}

/** Stands in for the buyer completing Stripe Checkout. */
export async function payNow(purchaseId: string) {
  const purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } });
  const session = {
    id: purchase.checkoutSessionId!,
    object: 'checkout.session' as const,
    amount_total: purchase.grossCents,
    currency: 'eur',
    payment_status: 'unpaid' as const,
    payment_intent: purchase.paymentIntentId!,
    payment_method_types: [purchase.paymentMethod as PaymentMethod],
    metadata: { listingId: purchase.listingId, designerId: purchase.designerId },
    payment_intent_data: {
      application_fee_amount: purchase.applicationFeeCents,
      transfer_data: { destination: 'acct_demo' },
    },
  };

  const { events } = completeSession(session);
  for (const event of events) await receive(event);

  revalidatePath('/studio');
  revalidatePath('/admin');
  redirect(`/checkout/${purchaseId}?done=1`);
}

export async function refundSale(formData: FormData) {
  const purchaseId = String(formData.get('purchaseId'));
  const share = String(formData.get('share') || 'full');
  const purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } });

  const remaining = purchase.grossCents - purchase.refundedCents;
  const amount = share === 'half' ? Math.round(remaining / 2) : remaining;

  const { events } = createRefund(purchase.chargeId!, amount, 'requested_by_customer');
  for (const event of events) await receive(event);

  revalidatePath('/studio');
  revalidatePath('/admin');
}

/** Marks the payout as already gone, so the next reversal has to be carried. */
export async function markPaidOut(purchaseId: string) {
  await prisma.purchase.update({ where: { id: purchaseId }, data: { paidOutAt: new Date() } });
  revalidatePath('/studio');
  revalidatePath('/admin');
}

export async function disputeSale(formData: FormData) {
  const purchaseId = String(formData.get('purchaseId'));
  const outcome = String(formData.get('outcome') || 'open');
  const purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } });

  if (outcome === 'open') {
    const { events } = openDispute(purchase.chargeId!, purchase.grossCents);
    for (const event of events) await receive(event);
  } else {
    const dispute: StripeDispute = {
      id: `dp_for_${purchase.chargeId}`,
      object: 'dispute',
      charge: purchase.chargeId!,
      amount: purchase.grossCents,
      status: 'warning_needs_response',
      reason: 'product_not_received',
    };
    const { events } = closeDispute(dispute, outcome as 'won' | 'lost');
    for (const event of events) await receive(event);
  }

  revalidatePath('/studio');
  revalidatePath('/admin');
}

export async function replayEvent(formData: FormData) {
  await replay(String(formData.get('eventId')));
  revalidatePath('/admin/events');
  revalidatePath('/studio');
}

/** Moves a designer through the Stripe Express onboarding stages. */
export async function advanceOnboarding(formData: FormData) {
  const designerId = String(formData.get('designerId'));
  const stage = String(formData.get('stage')) as AccountStage;

  const designer = await prisma.designer.findUniqueOrThrow({ where: { id: designerId } });
  const accountId = designer.stripeAccountId ?? `acct_demo_${designer.slug.replace(/-/g, '')}`;
  if (!designer.stripeAccountId) {
    await prisma.designer.update({ where: { id: designerId }, data: { stripeAccountId: accountId } });
  }

  const account = advanceAccount(accountId, stage);
  await receive(newEvent('account.updated', 'connect', account as unknown as Record<string, unknown>, accountId));

  revalidatePath('/studio');
  revalidatePath('/admin');
}
