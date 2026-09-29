/**
 * Self-billed invoices (zelffacturering).
 *
 * Tuindirigent issues the designer's BTW invoice on their behalf, so the two
 * hard requirements are Dutch law's, not Stripe's:
 *
 *   1. the numbering series must be gap-free and duplicate-free
 *   2. an issued document must never change
 *
 * Both are awkward because the trigger is a webhook, which can arrive twice,
 * out of order, or while another one is already running.
 *
 * A Postgres sequence cannot be used for the number: nextval() is
 * non-transactional, so a rolled-back insert leaves a hole in the series that
 * an accountant will ask about. Instead a single counter row is locked with
 * SELECT ... FOR UPDATE and incremented inside the same transaction as the
 * insert, so the number and the document commit or roll back together.
 */
import type { DocumentType, Purchase } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { creditNoteAmounts, formatDocumentNumber, invoiceAmounts } from '@/domain/documents';

/** Prisma's unique-constraint error, checked structurally so it survives a
 *  client or adapter upgrade. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export interface IssueResult {
  fullNumber: string;
  id: string;
  created: boolean;
}

interface IssueInput {
  type: DocumentType;
  purchase: Purchase;
  /** Stable across replays: derived from the Stripe object that caused it. */
  idempotencyKey: string;
  description: string;
  amounts: { netCents: number; vatRateBp: number; vatCents: number; totalCents: number };
  relatedId?: string;
}

async function issue(input: IssueInput): Promise<IssueResult> {
  const config = await prisma.config.findFirstOrThrow();
  const designer = await prisma.designer.findUniqueOrThrow({ where: { id: input.purchase.designerId } });

  // Fast path: if this event has been seen, hand back what it produced.
  const seen = await prisma.document.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (seen) return { fullNumber: seen.fullNumber, id: seen.id, created: false };

  try {
    return await prisma.$transaction(async (tx) => {
      // Serialise every issuer of this series behind one row lock. Concurrent
      // webhooks queue here instead of racing for the same number.
      const locked = await tx.$queryRaw<{ lastNumber: number }[]>`
        SELECT "lastNumber" FROM "DocumentCounter" WHERE "series" = ${config.invoiceSeries} FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new Error(`No counter row for series ${config.invoiceSeries}. Seed it before issuing.`);
      }

      const number = locked[0].lastNumber + 1;
      await tx.$executeRaw`
        UPDATE "DocumentCounter" SET "lastNumber" = ${number}, "updatedAt" = now()
        WHERE "series" = ${config.invoiceSeries}
      `;

      const doc = await tx.document.create({
        data: {
          type: input.type,
          series: config.invoiceSeries,
          number,
          fullNumber: formatDocumentNumber(config.invoiceSeries, number),
          purchaseId: input.purchase.id,
          designerId: designer.id,
          relatedId: input.relatedId,

          // Both parties are frozen here. Later edits to the designer's details
          // or a change to the VAT rate must not reach an issued document.
          sellerName: input.purchase.designerLegalName,
          sellerVatNumber: input.purchase.designerVatNumber,
          sellerAddress: input.purchase.designerAddress,
          buyerName: config.platformName,
          buyerVatNumber: config.platformVatNumber,
          buyerAddress: config.platformAddress,

          netCents: input.amounts.netCents,
          vatRateBp: input.amounts.vatRateBp,
          vatCents: input.amounts.vatCents,
          totalCents: input.amounts.totalCents,
          termsVersion: designer.selfBillingVersion ?? config.selfBillingTerms,
          description: input.description,
          idempotencyKey: input.idempotencyKey,
        },
      });

      return { fullNumber: doc.fullNumber, id: doc.id, created: true };
    });
  } catch (error) {
    // Two webhooks got past the fast path at the same time. The unique index on
    // idempotencyKey is the real guarantee; one transaction rolls back, the
    // number it held is released, and we return the document that won.
    if (isUniqueViolation(error)) {
      const existing = await prisma.document.findUniqueOrThrow({
        where: { idempotencyKey: input.idempotencyKey },
      });
      return { fullNumber: existing.fullNumber, id: existing.id, created: false };
    }
    throw error;
  }
}

/** The designer's sale invoice: their share ex-VAT plus the 21% gross-up. */
export function issueSaleInvoice(purchase: Purchase, listingTitle: string) {
  return issue({
    type: 'INVOICE',
    purchase,
    idempotencyKey: `INVOICE:${purchase.chargeId}`,
    description: listingTitle,
    amounts: invoiceAmounts(purchase),
  });
}

/** A credit note mirrors exactly the proportion that was reversed. */
export async function issueCreditNote(
  purchase: Purchase,
  reversalCents: number,
  stripeObjectId: string,
  reason: string,
) {
  const original = await prisma.document.findFirst({
    where: { purchaseId: purchase.id, type: 'INVOICE' },
  });
  if (!original) throw new Error(`No invoice to credit for purchase ${purchase.id}`);

  return issue({
    type: 'CREDIT_NOTE',
    purchase,
    idempotencyKey: `CREDIT_NOTE:${stripeObjectId}`,
    description: reason,
    relatedId: original.id,
    amounts: creditNoteAmounts(
      {
        netCents: original.netCents,
        vatRateBp: original.vatRateBp,
        vatCents: original.vatCents,
        totalCents: original.totalCents,
      },
      reversalCents,
      purchase.transferCents,
    ),
  });
}

/** Admin check: proves the series has no holes and no repeats. */
export async function auditSeries(series: string) {
  const docs = await prisma.document.findMany({
    where: { series },
    orderBy: { number: 'asc' },
    select: { number: true, fullNumber: true, type: true, issuedAt: true },
  });

  const gaps: number[] = [];
  const duplicates: number[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < docs.length; i += 1) {
    const n = docs[i].number;
    if (seen.has(n)) duplicates.push(n);
    seen.add(n);
    if (i > 0 && n !== docs[i - 1].number + 1) {
      for (let missing = docs[i - 1].number + 1; missing < n; missing += 1) gaps.push(missing);
    }
  }

  return { series, count: docs.length, first: docs[0]?.number ?? 0, last: docs.at(-1)?.number ?? 0, gaps, duplicates, docs };
}
