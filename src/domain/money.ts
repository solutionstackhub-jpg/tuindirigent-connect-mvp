/**
 * Payout arithmetic for the Tuindirigent marketplace.
 *
 * Framework-free on purpose: no Prisma, no Stripe, no Next. It drops into the
 * Express backend unchanged and it is the only place money is ever calculated.
 *
 * Rules that hold everywhere in here:
 *   - integer cents only, never floats for money
 *   - basis points for rates (2100 = 21,00%), so config carries no rounding
 *   - the VAT split is derived from the gross so the parts always re-add exactly
 */

export class CommissionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommissionConfigError';
  }
}

export interface SplitConfig {
  /** VAT rate in basis points. Comes from config, never hard-coded. */
  vatRateBp: number;
  /** Designer's share of the ex-VAT amount, in basis points. */
  designerShareBp: number;
}

export interface Split {
  /** What the buyer pays. Unchanged by any of this. */
  grossCents: number;
  /** The rates this split was computed with, carried so the snapshot and the
   *  invoice can never drift from the arithmetic that produced them. */
  vatRateBp: number;
  designerShareBp: number;
  /** Ex-VAT value of the sale. */
  netCents: number;
  /** Output VAT the platform owes on the sale to the buyer. */
  vatCents: number;
  /** Designer's share of the ex-VAT amount. */
  designerNetCents: number;
  /** VAT gross-up on the designer's share, which the platform reclaims. */
  designerVatCents: number;
  /** What Stripe transfers to the connected account. VAT-inclusive. */
  transferCents: number;
  /** application_fee_amount on the destination charge. */
  applicationFeeCents: number;
  /** The number that must never move when the VAT rate changes. */
  platformMarginCents: number;
}

const isCents = (v: number) => Number.isSafeInteger(v);

/**
 * Splits a marketplace sale.
 *
 * Worked example at 21% VAT and a 70% designer share, on a €121,00 sale:
 *   net 100,00 · VAT 21,00 · designer net 70,00 · designer VAT 14,70
 *   transfer 84,70 · application fee 36,30 · platform margin 30,00
 */
export function computeSplit(grossCents: number, config: SplitConfig): Split {
  const { vatRateBp, designerShareBp } = config;

  if (!isCents(grossCents) || grossCents <= 0) {
    throw new CommissionConfigError(`Gross amount must be a positive integer number of cents, got ${grossCents}`);
  }
  if (!isCents(vatRateBp) || vatRateBp < 0 || vatRateBp > 10_000) {
    throw new CommissionConfigError(`VAT rate must be between 0 and 10000 basis points, got ${vatRateBp}`);
  }
  if (!isCents(designerShareBp) || designerShareBp < 0 || designerShareBp > 10_000) {
    throw new CommissionConfigError(
      `Designer share must be between 0 and 10000 basis points (0-100%), got ${designerShareBp}. ` +
        `A share above 100% would pay out more than the buyer paid, so the sale is refused.`,
    );
  }

  const netCents = Math.round((grossCents * 10_000) / (10_000 + vatRateBp));
  const vatCents = grossCents - netCents;

  const designerNetCents = Math.round((netCents * designerShareBp) / 10_000);
  const designerVatCents = Math.round((designerNetCents * vatRateBp) / 10_000);
  const transferCents = designerNetCents + designerVatCents;
  const applicationFeeCents = grossCents - transferCents;
  const platformMarginCents = netCents - designerNetCents;

  // Unreachable while the share is capped at 100%, since transfer and gross
  // are grossed up by the same rate. Kept so that any future config path which
  // widens that cap fails loudly here instead of over-paying a designer.
  if (transferCents > grossCents) {
    throw new CommissionConfigError(
      `Transfer of ${transferCents} exceeds the ${grossCents} charged. ` +
        `Check the ${designerShareBp / 100}% share against the ${vatRateBp / 100}% VAT rate.`,
    );
  }
  if (applicationFeeCents < 0) {
    throw new CommissionConfigError(`Application fee would be negative (${applicationFeeCents}).`);
  }

  return {
    grossCents,
    vatRateBp,
    designerShareBp,
    netCents,
    vatCents,
    designerNetCents,
    designerVatCents,
    transferCents,
    applicationFeeCents,
    platformMarginCents,
  };
}

/**
 * The invariant the platform is tested on: the designer's VAT passes straight
 * through, so the margin is the commission on the ex-VAT amount and nothing else.
 *
 *   applicationFee - (outputVat - reclaimedVat) === net - designerNet
 */
export function realisedMargin(split: Split): number {
  return split.applicationFeeCents - (split.vatCents - split.designerVatCents);
}

/* -------------------------------------------------------------- refunds */

export interface ReversalPlan {
  /** Proportional reversal, taken on the VAT-inclusive amount transferred. */
  reversalCents: number;
  /** Portion of the refund that stays with the platform. */
  platformGivesBackCents: number;
}

/**
 * Refunds are proportional. A €60,50 refund on a €121,00 sale reverses exactly
 * half of the €84,70 that was transferred.
 */
export function planReversal(
  refundCents: number,
  snapshot: { grossCents: number; transferCents: number; refundedCents: number },
): ReversalPlan {
  if (!isCents(refundCents) || refundCents <= 0) {
    throw new CommissionConfigError(`Refund must be a positive integer number of cents, got ${refundCents}`);
  }
  const remaining = snapshot.grossCents - snapshot.refundedCents;
  if (refundCents > remaining) {
    throw new CommissionConfigError(
      `Refund of ${refundCents} exceeds the ${remaining} still refundable on this sale.`,
    );
  }

  const reversalCents = Math.round((snapshot.transferCents * refundCents) / snapshot.grossCents);
  return { reversalCents, platformGivesBackCents: refundCents - reversalCents };
}

export interface CostShare {
  designerCents: number;
  platformCents: number;
}

/**
 * Costs that Stripe keeps on a refund, and dispute fees, ride the same split as
 * the sale did. Remainder goes to the platform so the parts always re-add.
 */
export function shareCost(costCents: number, designerShareBp: number): CostShare {
  if (!isCents(costCents) || costCents < 0) {
    throw new CommissionConfigError(`Cost must be a non-negative integer number of cents, got ${costCents}`);
  }
  const designerCents = Math.round((costCents * designerShareBp) / 10_000);
  return { designerCents, platformCents: costCents - designerCents };
}

/* ------------------------------------------------------- carried balance */

export interface Settlement {
  /** What actually leaves for the connected account after settling. */
  transferCents: number;
  /** How much of the outstanding balance this sale cleared. */
  settledCents: number;
  /** What the designer still owes afterwards. */
  remainingBalanceCents: number;
}

/**
 * When a reversal cannot be taken from Stripe - the money already landed in the
 * designer's bank - the shortfall is carried and taken off the next sale.
 */
export function settleCarriedBalance(transferCents: number, carriedBalanceCents: number): Settlement {
  if (carriedBalanceCents <= 0) {
    return { transferCents, settledCents: 0, remainingBalanceCents: 0 };
  }
  const settledCents = Math.min(carriedBalanceCents, transferCents);
  return {
    transferCents: transferCents - settledCents,
    settledCents,
    remainingBalanceCents: carriedBalanceCents - settledCents,
  };
}

/* ------------------------------------------------------------ formatting */

export const euro = (cents: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);

export const pct = (bp: number) => `${(bp / 100).toLocaleString('nl-NL')}%`;
