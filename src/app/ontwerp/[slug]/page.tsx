import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { computeSplit, euro } from '@/domain/money';
import { checkSellGate, t } from '@/lib/services/gates';
import { buy } from '@/app/actions/sales';
import { Label, Money, Pill } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ refused?: string }>;
}) {
  const { slug } = await params;
  const { refused } = await searchParams;

  const listing = await prisma.listing.findUnique({
    where: { slug },
    include: { designer: true },
  });
  if (!listing) notFound();

  const config = await prisma.config.findFirstOrThrow();
  const gate = checkSellGate(listing.designer);
  const split = computeSplit(listing.priceInclVatCents, {
    vatRateBp: config.vatRateBp,
    designerShareBp: config.designerShareBp,
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/" className="link-underline text-[12.5px] text-ink-faint">
        ← Alle ontwerpen
      </Link>

      <div className="mt-6 grid gap-12 lg:grid-cols-[1.45fr_1fr]">
        {/* ------------------------------------------------------- gallery */}
        <div>
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-paper-2">
            <Image
              src={listing.coverUrl}
              alt={listing.title}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 60vw"
              className="object-cover"
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {listing.gallery.map((src) => (
              <div key={src} className="relative aspect-[4/3] overflow-hidden bg-paper-2">
                <Image src={src} alt="" fill sizes="20vw" className="object-cover" />
              </div>
            ))}
          </div>

          <div className="mt-10 max-w-xl">
            <Label>Over dit ontwerp</Label>
            <p className="mt-4 text-[15px] leading-[1.75] text-ink-soft">{listing.description}</p>

            <div className="mt-8 rule pt-6">
              <Label>Wat je krijgt</Label>
              <ul className="mt-3 space-y-2">
                {listing.deliverables.map((d) => (
                  <li key={d} className="flex gap-3 text-[14px] text-ink">
                    <span className="mt-[9px] h-px w-3 shrink-0 bg-moss" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------- buy column */}
        <div className="lg:sticky lg:top-20 lg:h-fit">
          <Pill tone="plain">{listing.type === 'PACKAGE' ? 'Pakket' : 'Ontwerp'}</Pill>
          <h1 className="display mt-3 text-[38px] leading-[1.05] text-ink">{listing.title}</h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">{listing.summary}</p>

          <div className="mt-6 flex items-center gap-3 rule pt-6">
            <div className="relative h-11 w-11 overflow-hidden rounded-full bg-paper-2">
              <Image src={listing.designer.avatarUrl} alt="" fill sizes="44px" className="object-cover" />
            </div>
            <div>
              <p className="text-[14px] text-ink">{listing.designer.studioName}</p>
              <p className="text-[12px] text-ink-faint">
                {listing.designer.name} · {listing.designer.city}
              </p>
            </div>
          </div>

          <div className="mt-6 rule pt-6">
            <div className="flex items-baseline justify-between">
              <Money cents={listing.priceInclVatCents} className="display text-[34px] text-ink" />
              <span className="text-[12.5px] text-ink-faint">incl. {config.vatRateBp / 100}% btw</span>
            </div>
            <p className="mt-1 text-[12.5px] text-ink-faint">
              {euro(split.netCents)} excl. btw · {listing.plotSize} · {listing.style}
            </p>
          </div>

          {refused ? (
            <p className="mt-5 border-l-2 border-rose bg-rose-soft px-4 py-3 text-[13px] text-rose">
              Deze verkoop is geweigerd: {refused}
            </p>
          ) : null}

          {gate.ok ? (
            <form action={buy} className="mt-6 space-y-3">
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="slug" value={listing.slug} />

              <div className="grid grid-cols-2 gap-2">
                <input
                  name="buyerName"
                  defaultValue="Marieke Jansen"
                  className="h-11 border border-line bg-card px-3 text-[13.5px] outline-none focus:border-moss"
                  placeholder="Naam"
                />
                <input
                  name="buyerEmail"
                  defaultValue="marieke@example.nl"
                  className="h-11 border border-line bg-card px-3 text-[13.5px] outline-none focus:border-moss"
                  placeholder="E-mail"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex h-11 cursor-pointer items-center gap-2 border border-line bg-card px-3 text-[13.5px] has-checked:border-moss has-checked:bg-moss-soft">
                  <input type="radio" name="method" value="ideal" defaultChecked className="accent-moss" />
                  iDEAL
                </label>
                <label className="flex h-11 cursor-pointer items-center gap-2 border border-line bg-card px-3 text-[13.5px] has-checked:border-moss has-checked:bg-moss-soft">
                  <input type="radio" name="method" value="card" className="accent-moss" />
                  Kaart
                </label>
              </div>

              <button
                type="submit"
                className="h-12 w-full bg-moss text-[14px] font-medium text-paper transition-colors hover:bg-moss-mid">
                Nu kopen
              </button>
              <p className="text-center text-[11.5px] text-ink-faint">
                {config.platformName} is de verkoper. Je ontvangt direct een factuur.
              </p>
            </form>
          ) : (
            <div className="mt-6 border border-gold/30 bg-gold-soft px-4 py-4">
              <p className="text-[13.5px] font-medium text-gold">Nog niet te koop</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                {listing.designer.studioName} kan nog niet uitbetaald worden, dus we nemen geen geld aan.
              </p>
              <ul className="mt-3 space-y-1">
                {gate.failures.map((f) => (
                  <li key={f.key} className="text-[12.5px] text-ink-soft">
                    · {t(f.title)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Demo-only: production never shows the buyer the split. */}
          <details className="mt-8 border border-dashed border-line px-4 py-3">
            <summary className="cursor-pointer text-[12px] text-ink-faint">
              Demo · hoe dit bedrag zich splitst
            </summary>
            <dl className="mt-3 space-y-1.5 text-[12.5px]">
              {[
                ['Koper betaalt', split.grossCents],
                [`Waarvan ${config.vatRateBp / 100}% btw`, split.vatCents],
                ['Exclusief btw', split.netCents],
                [`Ontwerper ${config.designerShareBp / 100}% excl. btw`, split.designerNetCents],
                ['Btw-opslag ontwerper', split.designerVatCents],
                ['Overboeking naar ontwerper', split.transferCents],
                ['application_fee_amount', split.applicationFeeCents],
              ].map(([label, cents]) => (
                <div key={label as string} className="flex justify-between gap-4">
                  <dt className="text-ink-faint">{label}</dt>
                  <dd className="num text-ink">{euro(cents as number)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-line pt-1.5">
                <dt className="text-moss">Netto marge platform</dt>
                <dd className="num text-moss">{euro(split.platformMarginCents)}</dd>
              </div>
            </dl>
          </details>
        </div>
      </div>
    </main>
  );
}
