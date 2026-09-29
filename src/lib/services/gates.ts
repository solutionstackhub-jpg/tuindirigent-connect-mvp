/**
 * Publish and sell gates.
 *
 * A designer may only publish or sell when payouts are ready AND a valid BTW
 * number is on file AND the self-billing agreement has been accepted. The
 * designer is told exactly which one is missing - "you cannot publish" with no
 * reason is the fastest way to generate support mail.
 *
 * Every publish path goes through here, including admin approval.
 *
 * All user-facing copy exists in Dutch and English, because the platform ships
 * in both and a half-translated blocker is worse than none.
 */
import type { Designer } from '@/generated/prisma/client';

export type Locale = 'nl' | 'en';
export type GateKey = 'payouts' | 'vat' | 'selfBilling';

export interface Copy {
  nl: string;
  en: string;
}

export interface GateFailure {
  key: GateKey;
  title: Copy;
  detail: Copy;
  action: Copy;
  href: string;
}

export interface GateResult {
  ok: boolean;
  failures: GateFailure[];
}

const payoutDetail = (designer: Designer): Copy => {
  switch (designer.connectStatus) {
    case 'NOT_STARTED':
      return {
        nl: 'Je bent nog niet begonnen met de Stripe-onboarding.',
        en: 'You have not started Stripe onboarding yet.',
      };
    case 'UNDER_REVIEW':
      return {
        nl: 'Stripe beoordeelt je gegevens nog. Je hoeft nu niets te doen.',
        en: 'Stripe is still reviewing your details. Nothing to do but wait.',
      };
    case 'RESTRICTED':
      return {
        nl: 'Stripe heeft je account beperkt en vraagt om een extra document.',
        en: 'Stripe has restricted your account and needs another document.',
      };
    default:
      return {
        nl: 'Stripe heeft nog een paar gegevens van je nodig.',
        en: 'Stripe still needs a few details from you.',
      };
  }
};

export function checkSellGate(designer: Designer): GateResult {
  const failures: GateFailure[] = [];

  if (!designer.payoutsEnabled) {
    failures.push({
      key: 'payouts',
      title: { nl: 'Uitbetaling nog niet klaar', en: 'Payouts not ready' },
      detail: payoutDetail(designer),
      action:
        designer.connectStatus === 'UNDER_REVIEW'
          ? { nl: 'Bekijk status', en: 'View status' }
          : { nl: 'Onboarding afmaken', en: 'Continue onboarding' },
      href: '/studio/onboarding',
    });
  }

  if (!designer.vatNumber || !designer.vatNumberValid) {
    failures.push({
      key: 'vat',
      title: { nl: 'Btw-nummer ontbreekt', en: 'BTW number missing' },
      detail: {
        nl: 'Ontwerpers moeten btw-plichtig ondernemer zijn. Wij factureren namens jou, dus we hebben het nummer nodig.',
        en: 'Designers must be VAT-registered businesses. We invoice on your behalf, so we need the number.',
      },
      action: { nl: 'Btw-nummer toevoegen', en: 'Add BTW number' },
      href: '/studio/onboarding',
    });
  }

  if (!designer.selfBillingAcceptedAt) {
    failures.push({
      key: 'selfBilling',
      title: { nl: 'Zelffacturering niet geaccepteerd', en: 'Self-billing agreement not accepted' },
      detail: {
        nl: 'Tuindirigent maakt bij elke verkoop jouw btw-factuur. De Nederlandse regels vragen eerst om je akkoord.',
        en: 'Tuindirigent issues your BTW invoice for every sale. Dutch law needs your agreement first.',
      },
      action: { nl: 'Lezen en akkoord geven', en: 'Read and accept' },
      href: '/studio/onboarding',
    });
  }

  return { ok: failures.length === 0, failures };
}

export const t = (copy: Copy, locale: Locale = 'nl') => copy[locale];
