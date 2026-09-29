import { describe, expect, it } from 'vitest';
import { computeSplit } from './money';
import {
  creditNoteAmounts,
  documentIdempotencyKey,
  formatDocumentNumber,
  invoiceAmounts,
} from './documents';

const NL = { vatRateBp: 2100, designerShareBp: 7000 };

describe('invoiceAmounts', () => {
  it('invoices the designer share with the gross-up', () => {
    const s = computeSplit(12_100, NL);
    expect(invoiceAmounts(s)).toEqual({
      netCents: 7_000,
      vatRateBp: 2100,
      vatCents: 1_470,
      totalCents: 8_470,
    });
  });

  it('the invoice total is always exactly what Stripe transferred', () => {
    for (let gross = 500; gross <= 200_000; gross += 997) {
      const s = computeSplit(gross, NL);
      expect(invoiceAmounts(s).totalCents).toBe(s.transferCents);
    }
  });
});

describe('creditNoteAmounts', () => {
  it('credits the same proportion that was reversed', () => {
    const s = computeSplit(12_100, NL);
    const original = invoiceAmounts(s);
    const half = creditNoteAmounts(original, 4_235, s.transferCents);
    expect(half.totalCents).toBe(4_235);
    expect(half.netCents).toBe(3_500);
    expect(half.vatCents).toBe(735);
  });

  it('a full credit note mirrors the invoice exactly', () => {
    const s = computeSplit(8_950, NL);
    const original = invoiceAmounts(s);
    const full = creditNoteAmounts(original, s.transferCents, s.transferCents);
    expect(full).toEqual(original);
  });

  it('never credits more than was invoiced', () => {
    const s = computeSplit(12_100, NL);
    const original = invoiceAmounts(s);
    expect(creditNoteAmounts(original, 999_999, s.transferCents).totalCents).toBe(original.totalCents);
  });

  it('net and VAT always re-add to the credited total', () => {
    const s = computeSplit(45_733, NL);
    const original = invoiceAmounts(s);
    for (let reversal = 1; reversal <= s.transferCents; reversal += 311) {
      const cn = creditNoteAmounts(original, reversal, s.transferCents);
      expect(cn.netCents + cn.vatCents).toBe(cn.totalCents);
    }
  });
});

describe('numbering', () => {
  it('pads into a sortable, gap-visible series', () => {
    expect(formatDocumentNumber('TD-2026', 1)).toBe('TD-2026-000001');
    expect(formatDocumentNumber('TD-2026', 42)).toBe('TD-2026-000042');
  });

  it('derives the same key for a replayed event, so the unique index catches it', () => {
    expect(documentIdempotencyKey('INVOICE', 'ch_3Ox')).toBe(documentIdempotencyKey('INVOICE', 'ch_3Ox'));
    expect(documentIdempotencyKey('CREDIT_NOTE', 'ch_3Ox')).not.toBe(
      documentIdempotencyKey('INVOICE', 'ch_3Ox'),
    );
  });
});
