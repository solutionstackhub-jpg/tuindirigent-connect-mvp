/**
 * A stand-in for the Stripe API.
 *
 * It exists so the whole payout lifecycle - onboarding, destination charges,
 * transfers, reversals, disputes - can be driven in a demo without keys. The
 * object and event shapes follow the real API closely, and every state change
 * comes back as an event rather than a return value, because that is how the
 * production code will have to receive it.
 *
 * Swapping this for the real SDK is a change in one file: the services below
 * only ever see these shapes.
 */

export type StripeEndpoint = 'platform' | 'connect';

export interface StripeEvent<T = Record<string, unknown>> {
  id: string;
  type: string;
  created: number;
  endpoint: StripeEndpoint;
  account?: string;
  data: { object: T };
}

let counter = 0;
const nextId = (prefix: string) => {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36).padStart(3, '0')}`;
};

export const newEvent = <T extends Record<string, unknown>>(
  type: string,
  endpoint: StripeEndpoint,
  object: T,
  account?: string,
): StripeEvent<T> => ({
  id: nextId('evt'),
  type,
  created: Math.floor(Date.now() / 1000),
  endpoint,
  account,
  data: { object },
});

/* ------------------------------------------------------------- pricing */

/**
 * Stripe's cut. Set these from the client's actual Stripe pricing before go-live;
 * they are here so the refund arithmetic has something real to share out.
 */
export const STRIPE_PRICING = {
  card: { percentBp: 150, fixedCents: 25 }, // European cards
  ideal: { percentBp: 0, fixedCents: 29 },  // iDEAL is a flat fee
  disputeFeeCents: 1500,
} as const;

export type PaymentMethod = keyof Pick<typeof STRIPE_PRICING, 'card' | 'ideal'>;

export function stripeFeeFor(grossCents: number, method: PaymentMethod): number {
  const p = STRIPE_PRICING[method];
  return Math.round((grossCents * p.percentBp) / 10_000) + p.fixedCents;
}

/* ------------------------------------------------------- account objects */

export type AccountStage = 'created' | 'submitted' | 'under_review' | 'enabled' | 'restricted';

export interface StripeAccount {
  id: string;
  object: 'account';
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: { currently_due: string[]; disabled_reason: string | null };
}

const STAGE: Record<AccountStage, Omit<StripeAccount, 'id' | 'object'>> = {
  created: {
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
    requirements: {
      currently_due: ['business_profile.url', 'individual.id_number', 'external_account'],
      disabled_reason: 'requirements.past_due',
    },
  },
  submitted: {
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: true,
    requirements: { currently_due: ['external_account'], disabled_reason: 'requirements.past_due' },
  },
  under_review: {
    charges_enabled: true,
    payouts_enabled: false,
    details_submitted: true,
    requirements: { currently_due: [], disabled_reason: 'under_review' },
  },
  enabled: {
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    requirements: { currently_due: [], disabled_reason: null },
  },
  restricted: {
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: true,
    requirements: {
      currently_due: ['individual.verification.document'],
      disabled_reason: 'requirements.past_due',
    },
  },
};

export function createAccount(): StripeAccount {
  return { id: nextId('acct'), object: 'account', ...STAGE.created };
}

export function advanceAccount(id: string, stage: AccountStage): StripeAccount {
  return { id, object: 'account', ...STAGE[stage] };
}

/* ------------------------------------------------------ checkout & charge */

export interface CheckoutSessionParams {
  amountCents: number;
  currency: 'eur';
  method: PaymentMethod;
  destination: string;
  applicationFeeCents: number;
  metadata: Record<string, string>;
}

export interface CheckoutSession {
  id: string;
  object: 'checkout.session';
  amount_total: number;
  currency: string;
  payment_status: 'unpaid' | 'paid';
  payment_intent: string;
  payment_method_types: PaymentMethod[];
  metadata: Record<string, string>;
  /** Destination charge: the platform stays merchant of record. */
  payment_intent_data: {
    application_fee_amount: number;
    transfer_data: { destination: string };
  };
}

export function createCheckoutSession(p: CheckoutSessionParams): CheckoutSession {
  if (p.applicationFeeCents < 0 || p.applicationFeeCents > p.amountCents) {
    throw new Error(`Invalid application_fee_amount ${p.applicationFeeCents} for a ${p.amountCents} charge`);
  }
  return {
    id: nextId('cs'),
    object: 'checkout.session',
    amount_total: p.amountCents,
    currency: p.currency,
    payment_status: 'unpaid',
    payment_intent: nextId('pi'),
    payment_method_types: [p.method],
    metadata: p.metadata,
    payment_intent_data: {
      application_fee_amount: p.applicationFeeCents,
      transfer_data: { destination: p.destination },
    },
  };
}

export interface StripeCharge {
  id: string;
  object: 'charge';
  amount: number;
  amount_refunded: number;
  currency: string;
  payment_intent: string;
  payment_method_details: { type: PaymentMethod };
  application_fee_amount: number;
  transfer: string;
  destination: string;
  metadata: Record<string, string>;
}

export function completeSession(session: CheckoutSession): {
  charge: StripeCharge;
  transferId: string;
  events: StripeEvent[];
} {
  const transferId = nextId('tr');
  const charge: StripeCharge = {
    id: nextId('ch'),
    object: 'charge',
    amount: session.amount_total,
    amount_refunded: 0,
    currency: session.currency,
    payment_intent: session.payment_intent,
    payment_method_details: { type: session.payment_method_types[0] },
    application_fee_amount: session.payment_intent_data.application_fee_amount,
    transfer: transferId,
    destination: session.payment_intent_data.transfer_data.destination,
    metadata: session.metadata,
  };

  return {
    charge,
    transferId,
    events: [
      newEvent('checkout.session.completed', 'platform', {
        ...session,
        payment_status: 'paid',
        charge: charge.id,
      } as unknown as Record<string, unknown>),
    ],
  };
}

/* ---------------------------------------------------------------- refunds */

export interface StripeRefund {
  id: string;
  object: 'refund';
  amount: number;
  charge: string;
  reason: string | null;
}

export function createRefund(chargeId: string, amountCents: number, reason: string | null = null) {
  const refund: StripeRefund = { id: nextId('re'), object: 'refund', amount: amountCents, charge: chargeId, reason };
  return {
    refund,
    events: [newEvent('charge.refunded', 'platform', refund as unknown as Record<string, unknown>)],
  };
}

export class InsufficientBalanceError extends Error {
  constructor(public readonly availableCents: number) {
    super('Insufficient funds in the connected account to reverse this transfer.');
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * Reversing a transfer only works while the money is still sitting in the
 * connected account. Once Stripe has paid it out to the designer's bank, this
 * throws and the shortfall has to be carried.
 */
export function reverseTransfer(transferId: string, amountCents: number, alreadyPaidOut: boolean) {
  if (alreadyPaidOut) throw new InsufficientBalanceError(0);
  return {
    reversal: { id: nextId('trr'), object: 'transfer_reversal', amount: amountCents, transfer: transferId },
  };
}

/* --------------------------------------------------------------- disputes */

export interface StripeDispute {
  id: string;
  object: 'dispute';
  charge: string;
  amount: number;
  status: 'warning_needs_response' | 'won' | 'lost';
  reason: string;
}

export function openDispute(chargeId: string, amountCents: number, reason = 'product_not_received') {
  const dispute: StripeDispute = {
    id: nextId('dp'),
    object: 'dispute',
    charge: chargeId,
    amount: amountCents,
    status: 'warning_needs_response',
    reason,
  };
  return {
    dispute,
    events: [newEvent('charge.dispute.created', 'platform', dispute as unknown as Record<string, unknown>)],
  };
}

export function closeDispute(dispute: StripeDispute, outcome: 'won' | 'lost') {
  const closed: StripeDispute = { ...dispute, status: outcome };
  return {
    dispute: closed,
    events: [newEvent('charge.dispute.closed', 'platform', closed as unknown as Record<string, unknown>)],
  };
}
