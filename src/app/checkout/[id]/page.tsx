import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { euro } from '@/domain/money';
import { payNow } from '@/app/actions/sales';
import { Label } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { id } = await params;
  const { done } = await searchParams;

  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { listing: true, designer: true, documents: { where: { type: 'INVOICE' } } },
  });
  if (!purchase) notFound();

  const config = await prisma.config.findFirstOrThrow();
  const paid = purchase.status !== 'PENDING';
  const invoice = purchase.documents[0];

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr]">
        {/* ------------------------------------------------------ order */}
        <div>
          <Label>Bestelling</Label>
          <div className="mt-5 flex gap-4">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden bg-paper-2">
              <Image src={purchase.listing.coverUrl} alt="" fill sizes="96px" className="object-cover" />
            </div>
            <div>
              <h1 className="display text-[24px] leading-tight text-ink">{purchase.listing.title}</h1>
              <p className="mt-1 text-[13px] text-ink-faint">
                {purchase.designer.studioName} · {purchase.listing.plotSize}
              </p>
            </div>
          </div>

          <dl className="mt-8 space-y-2 rule pt-6 text-[13.5px]">
            <div className="flex justify-between">
              <dt className="text-ink-faint">Subtotaal excl. btw</dt>
              <dd className="num text-ink">{euro(purchase.netCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-faint">Btw {purchase.vatRateBp / 100}%</dt>
              <dd className="num text-ink">{euro(purchase.vatCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-[16px]">
              <dt className="text-ink">Totaal</dt>
              <dd className="num text-ink">{euro(purchase.grossCents)}</dd>
            </div>
          </dl>

          <p className="mt-6 text-[12px] leading-relaxed text-ink-faint">
            {config.platformName} is de verkoper van deze bestelling en staat op je factuur. De ontwerper
            wordt daarna door ons uitbetaald.
          </p>
        </div>

        {/* ------------------------------------------------------- payment */}
        <div className="card p-8">
          {!paid ? (
            <>
              <div className="flex items-center justify-between">
                <Label>Betalen</Label>
                <span className="text-[11px] text-ink-faint">Stripe testmodus</span>
              </div>

              <div className="mt-6 border border-line bg-paper-2/60 px-4 py-4">
                <p className="text-[13px] text-ink">
                  {purchase.paymentMethod === 'ideal' ? 'iDEAL' : 'Creditcard'}
                </p>
                <p className="mt-1 text-[12px] text-ink-faint">
                  {purchase.paymentMethod === 'ideal'
                    ? 'Je wordt doorgestuurd naar je bank. iDEAL bevestigt asynchroon, dus de bevestiging kan een moment duren.'
                    : 'Test kaart 4242 4242 4242 4242, elke toekomstige datum.'}
                </p>
              </div>

              <form action={payNow.bind(null, purchase.id)} className="mt-6">
                <button
                  type="submit"
                  className="h-12 w-full bg-moss text-[14.5px] font-medium text-paper transition-colors hover:bg-moss-mid">
                  Betaal {euro(purchase.grossCents)}
                </button>
              </form>

              <p className="mt-4 text-center text-[11.5px] text-ink-faint">
                Demo: dit stuurt een checkout.session.completed naar de webhook.
              </p>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-moss-soft">
                <span className="text-[18px] text-moss">✓</span>
              </div>
              <h2 className="display mt-5 text-[26px] text-ink">Betaald</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
                {euro(purchase.grossCents)} ontvangen. De ontwerper wordt uitbetaald
                {purchase.payoutHoldUntil
                  ? ` op ${purchase.payoutHoldUntil.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}`
                  : ''}
                .
              </p>

              <dl className="mt-6 space-y-1.5 rule pt-5 text-[12.5px]">
                <div className="flex justify-between">
                  <dt className="text-ink-faint">Overboeking ontwerper</dt>
                  <dd className="num text-ink">{euro(purchase.transferCents)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-faint">application_fee_amount</dt>
                  <dd className="num text-ink">{euro(purchase.applicationFeeCents)}</dd>
                </div>
              </dl>

              {invoice ? (
                <Link
                  href={`/factuur/${invoice.fullNumber}`}
                  className="mt-6 flex h-11 w-full items-center justify-center border border-line text-[13.5px] text-ink transition-colors hover:border-ink-faint">
                  Factuur {invoice.fullNumber} bekijken
                </Link>
              ) : null}

              <Link
                href="/studio"
                className="mt-2 flex h-11 w-full items-center justify-center text-[13.5px] text-ink-soft hover:text-ink">
                Naar de studio van de ontwerper →
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
