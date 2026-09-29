/**
 * Marketplace checkout.
 *
 * The buyer's experience does not change: same button, same Stripe Checkout,
 * same price including VAT, and Tuindirigent stays merchant of record. The only
 * thing that changes is what the session carries - a destination and an
 * application fee.
 */
import { prisma } from '@/lib/db';
import { computeSplit } from '@/domain/money';
import { createCheckoutSession, type PaymentMethod } from '@/lib/stripe/mock';
import { checkSellGate, t } from './gates';

export class SaleRefusedError extends Error {
  constructor(
    message: string,
    public readonly reasons: string[],
  ) {
    super(message);
    this.name = 'SaleRefusedError';
  }
}

export async function startCheckout(params: {
  listingId: string;
  buyerName: string;
  buyerEmail: string;
  method: PaymentMethod;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: params.listingId },
    include: { designer: true },
  });
  const config = await prisma.config.findFirstOrThrow();
  const { designer } = listing;

  const gate = checkSellGate(designer);
  if (!gate.ok) {
    throw new SaleRefusedError(
      `${designer.studioName} cannot sell yet.`,
      gate.failures.map((f) => t(f.title)),
    );
  }

  // Throws CommissionConfigError on a misconfigured commission, which is what
  // refuses the sale instead of letting a bad fee reach Stripe.
  const split = computeSplit(listing.priceInclVatCents, {
    vatRateBp: config.vatRateBp,
    designerShareBp: config.designerShareBp,
  });

  const session = createCheckoutSession({
    amountCents: split.grossCents,
    currency: 'eur',
    method: params.method,
    destination: designer.stripeAccountId!,
    applicationFeeCents: split.applicationFeeCents,
    metadata: { listingId: listing.id, designerId: designer.id },
  });

  // Everything the payout and the invoice will need is frozen now.
  const purchase = await prisma.purchase.create({
    data: {
      listingId: listing.id,
      designerId: designer.id,
      buyerName: params.buyerName,
      buyerEmail: params.buyerEmail,
      paymentMethod: params.method,
      checkoutSessionId: session.id,
      paymentIntentId: session.payment_intent,

      grossCents: split.grossCents,
      vatRateBp: split.vatRateBp,
      netCents: split.netCents,
      vatCents: split.vatCents,
      designerShareBp: split.designerShareBp,
      designerNetCents: split.designerNetCents,
      designerVatCents: split.designerVatCents,
      transferCents: split.transferCents,
      applicationFeeCents: split.applicationFeeCents,

      designerVatNumber: designer.vatNumber!,
      designerLegalName: designer.studioName,
      designerAddress: designer.address ?? designer.city,
    },
  });

  return { purchase, session, split };
}
