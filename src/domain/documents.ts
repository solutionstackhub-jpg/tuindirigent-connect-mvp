/**
 * Self-billed invoice and credit note figures.
 *
 * Tuindirigent issues the designer's BTW invoice on their behalf, so the
 * "seller" on the document is the designer and the "buyer" is the platform.
 * Everything is built from the purchase snapshot, never from live records.
 */

export type DocumentType = 'INVOICE' | 'CREDIT_NOTE';

export interface DocumentAmounts {
  netCents: number;
  vatRateBp: number;
  vatCents: number;
  totalCents: number;
}

/** The sale invoice: the designer's share, ex-VAT, plus the gross-up. */
export function invoiceAmounts(snapshot: {
  designerNetCents: number;
  designerVatCents: number;
  vatRateBp: number;
}): DocumentAmounts {
  return {
    netCents: snapshot.designerNetCents,
    vatRateBp: snapshot.vatRateBp,
    vatCents: snapshot.designerVatCents,
    totalCents: snapshot.designerNetCents + snapshot.designerVatCents,
  };
}

/**
 * A credit note mirrors the proportion that was reversed, so a half refund
 * credits exactly half of the original invoice and the VAT follows.
 */
export function creditNoteAmounts(
  original: DocumentAmounts,
  reversalCents: number,
  originalTransferCents: number,
): DocumentAmounts {
  if (originalTransferCents <= 0) {
    throw new Error('Cannot credit against a zero transfer.');
  }
  const totalCents = Math.min(reversalCents, original.totalCents);
  const netCents = Math.round((original.netCents * totalCents) / original.totalCents);
  return {
    netCents,
    vatRateBp: original.vatRateBp,
    vatCents: totalCents - netCents,
    totalCents,
  };
}

/** TD-2026-000042. Sequential, gap-free, padded so sorting is obvious. */
export function formatDocumentNumber(series: string, number: number): string {
  return `${series}-${String(number).padStart(6, '0')}`;
}

/**
 * Idempotency key for document creation. Derived from the Stripe event, so a
 * replayed webhook lands on the same unique constraint instead of minting a
 * second document or burning a number.
 */
export function documentIdempotencyKey(type: DocumentType, stripeObjectId: string): string {
  return `${type}:${stripeObjectId}`;
}
