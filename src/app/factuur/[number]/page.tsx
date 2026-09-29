import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { euro } from '@/domain/money';

export const dynamic = 'force-dynamic';

/**
 * The document itself. Rendered from the snapshot on the record, never from the
 * live designer or the current VAT rate, so an issued invoice cannot change.
 * The same markup prints to A4 and is what the PDF endpoint renders.
 */
export default async function InvoicePage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const doc = await prisma.document.findUnique({
    where: { fullNumber: decodeURIComponent(number) },
    include: { purchase: { include: { listing: true } }, relatedDocument: true },
  });
  if (!doc) notFound();

  const isCredit = doc.type === 'CREDIT_NOTE';
  const sign = isCredit ? -1 : 1;

  return (
    <div className="min-h-screen bg-paper-2/60 py-10 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-6 flex max-w-[210mm] items-center justify-between px-6">
        <Link href="/studio" className="link-underline text-[12.5px] text-ink-faint">
          ← Terug naar de studio
        </Link>
        <div className="flex gap-2">
          <a
            href={`/api/factuur/${encodeURIComponent(doc.fullNumber)}/pdf`}
            className="flex h-9 items-center border border-line bg-card px-4 text-[12.5px] text-ink hover:border-ink-faint">
            PDF downloaden
          </a>
        </div>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white px-14 py-14 shadow-sm print:shadow-none">
        <header className="flex items-start justify-between">
          <div>
            <p className="display text-[22px] text-moss">
              Tuin<span className="italic font-normal text-ink">dirigent</span>
            </p>
            <p className="mt-6 text-[11px] uppercase tracking-[0.14em] text-ink-faint">
              {isCredit ? 'Creditfactuur' : 'Factuur'} · zelffacturering
            </p>
            <p className="display mt-1 text-[30px] text-ink">{doc.fullNumber}</p>
          </div>
          <div className="text-right text-[12px] leading-relaxed text-ink-soft">
            <p>
              Datum{' '}
              <span className="num text-ink">
                {doc.issuedAt.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            </p>
            {doc.relatedDocument ? (
              <p className="mt-1">
                Betreft factuur <span className="num text-ink">{doc.relatedDocument.fullNumber}</span>
              </p>
            ) : null}
            <p className="mt-1">Voorwaarden {doc.termsVersion}</p>
          </div>
        </header>

        <p className="mt-10 border-l-2 border-moss-line bg-moss-soft/50 px-4 py-3 text-[11.5px] leading-relaxed text-moss">
          Deze factuur is namens de leverancier opgesteld door de afnemer op grond van een
          zelffactureringsovereenkomst (versie {doc.termsVersion}).
          <span className="mt-1 block opacity-70">
            This invoice is issued by the customer on behalf of the supplier under a self-billing agreement.
          </span>
        </p>

        <div className="mt-10 grid grid-cols-2 gap-10">
          <div>
            <p className="text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">Leverancier · ontwerper</p>
            <p className="mt-2 text-[14px] text-ink">{doc.sellerName}</p>
            <p className="text-[12.5px] leading-relaxed text-ink-soft">{doc.sellerAddress}</p>
            <p className="num mt-1 text-[12.5px] text-ink-soft">Btw {doc.sellerVatNumber}</p>
          </div>
          <div>
            <p className="text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">Afnemer · platform</p>
            <p className="mt-2 text-[14px] text-ink">{doc.buyerName}</p>
            <p className="text-[12.5px] leading-relaxed text-ink-soft">{doc.buyerAddress}</p>
            <p className="num mt-1 text-[12.5px] text-ink-soft">Btw {doc.buyerVatNumber}</p>
          </div>
        </div>

        <table className="mt-12 w-full text-[13px]">
          <thead>
            <tr className="border-b border-ink text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
              <th className="pb-2 text-left font-semibold">Omschrijving</th>
              <th className="pb-2 text-right font-semibold">Bedrag excl. btw</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="py-4 align-top">
                <p className="text-ink">{doc.description}</p>
                <p className="mt-1 text-[11.5px] text-ink-faint">
                  {doc.purchase.listing.title} · verkoop van{' '}
                  {doc.purchase.createdAt.toLocaleDateString('nl-NL')} ·{' '}
                  {doc.purchase.designerShareBp / 100}% van het bedrag exclusief btw
                </p>
              </td>
              <td className="num py-4 text-right align-top text-ink">{euro(sign * doc.netCents)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 ml-auto w-72 space-y-2 text-[13px]">
          <div className="flex justify-between">
            <span className="text-ink-faint">Subtotaal</span>
            <span className="num text-ink">{euro(sign * doc.netCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-faint">Btw {doc.vatRateBp / 100}%</span>
            <span className="num text-ink">{euro(sign * doc.vatCents)}</span>
          </div>
          <div className="flex justify-between border-t border-ink pt-2 text-[16px]">
            <span className="text-ink">{isCredit ? 'Te crediteren' : 'Totaal'}</span>
            <span className="num text-ink">{euro(sign * doc.totalCents)}</span>
          </div>
        </div>

        <footer className="mt-16 border-t border-line pt-4 text-[10.5px] leading-relaxed text-ink-faint">
          <p>
            Betaling verloopt via Stripe Connect; het bedrag is bij de verkoop overgeboekt naar de
            gekoppelde rekening van de leverancier. Dit document is onveranderlijk na uitgifte.
          </p>
        </footer>
      </article>
    </div>
  );
}
