/**
 * Ledger reasons, in both languages.
 *
 * The ledger stores a key and its parameters, never a rendered sentence. A row
 * written today still renders correctly in English tomorrow, and a wording fix
 * does not require rewriting history.
 */
import { euro } from './money';

export type Locale = 'nl' | 'en';

export type LedgerMessageKey =
  | 'sale.transfer'
  | 'refund.reversal'
  | 'refund.carried'
  | 'refund.sharedFee'
  | 'dispute.hold'
  | 'dispute.release'
  | 'dispute.sharedFee'
  | 'balance.settled';

type Params = Record<string, string | number>;

const MESSAGES: Record<LedgerMessageKey, Record<Locale, (p: Params) => string>> = {
  'sale.transfer': {
    nl: (p) => `Overboeking verkoop: ${p.share}% van het bedrag exclusief btw, plus ${p.vat}% btw`,
    en: (p) => `Sale transfer: ${p.share}% of the ex-VAT amount plus ${p.vat}% VAT`,
  },
  'refund.reversal': {
    nl: (p) => `Evenredige terugboeking van een terugbetaling van ${p.amount}, over het btw-inclusieve bedrag`,
    en: (p) => `Proportional reversal of a ${p.amount} refund, taken on the VAT-inclusive transfer`,
  },
  'refund.carried': {
    nl: () => 'De uitbetaling was al bij Stripe vertrokken, dus deze terugboeking gaat van je volgende verkoop af',
    en: () => 'The payout had already left Stripe, so this reversal is carried to your next sale',
  },
  'refund.sharedFee': {
    nl: (p) => `Jouw ${p.share}% van de ${p.amount} transactiekosten die Stripe bij terugbetaling inhoudt`,
    en: (p) => `Your ${p.share}% share of the ${p.amount} Stripe fee kept on the refund`,
  },
  'dispute.hold': {
    nl: () => 'Aandeel teruggeboekt en uitbetalingen geblokkeerd zolang de chargeback loopt',
    en: () => 'Share reversed and payouts held while the dispute is open',
  },
  'dispute.release': {
    nl: () => 'Chargeback gewonnen: je aandeel is hersteld en de blokkade is opgeheven',
    en: () => 'Dispute won: your share is restored and the hold is lifted',
  },
  'dispute.sharedFee': {
    nl: (p) => `Jouw aandeel in de ${p.amount} chargebackkosten`,
    en: (p) => `Your share of the ${p.amount} dispute fee`,
  },
  'balance.settled': {
    nl: () => 'Openstaand saldo van een eerdere terugbetaling verrekend met deze verkoop',
    en: () => 'Outstanding balance from an earlier refund settled from this sale',
  },
};

export function renderLedgerReason(key: string, params: unknown, locale: Locale = 'nl'): string {
  const entry = MESSAGES[key as LedgerMessageKey];
  if (!entry) return key;
  return entry[locale]((params ?? {}) as Params);
}

export const money = euro;
