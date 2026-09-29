import { prisma } from '@/lib/db';

/** Bookkeeping export. One row per document, amounts in euro with a decimal point. */
export async function GET() {
  const docs = await prisma.document.findMany({
    orderBy: { number: 'asc' },
    include: { purchase: { include: { listing: true } }, relatedDocument: true },
  });

  const cents = (v: number) => (v / 100).toFixed(2);
  const header = [
    'nummer',
    'soort',
    'datum',
    'leverancier',
    'btw_leverancier',
    'afnemer',
    'btw_afnemer',
    'omschrijving',
    'netto',
    'btw_tarief',
    'btw',
    'totaal',
    'gerelateerd',
  ];

  const rows = docs.map((d) => [
    d.fullNumber,
    d.type === 'INVOICE' ? 'factuur' : 'creditfactuur',
    d.issuedAt.toISOString().slice(0, 10),
    d.sellerName,
    d.sellerVatNumber,
    d.buyerName,
    d.buyerVatNumber,
    d.purchase.listing.title,
    cents(d.type === 'CREDIT_NOTE' ? -d.netCents : d.netCents),
    `${d.vatRateBp / 100}%`,
    cents(d.type === 'CREDIT_NOTE' ? -d.vatCents : d.vatCents),
    cents(d.type === 'CREDIT_NOTE' ? -d.totalCents : d.totalCents),
    d.relatedDocument?.fullNumber ?? '',
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tuindirigent-facturen-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
