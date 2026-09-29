import Image from 'next/image';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { checkSellGate, t } from '@/lib/services/gates';
import { Label, Money, Pill } from '@/components/ui';
import { gardens } from '@/lib/images';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const config = await prisma.config.findFirstOrThrow();
  const listings = await prisma.listing.findMany({
    where: { published: true },
    include: { designer: true },
    orderBy: { createdAt: 'asc' },
  });

  // The rollout feature flag: hide listings from designers who cannot be paid.
  const visible = config.hideUnonboardedList
    ? listings.filter((l) => checkSellGate(l.designer).ok)
    : listings;

  const designers = await prisma.designer.findMany({ orderBy: { createdAt: 'asc' } });
  const hidden = listings.length - visible.length;

  return (
    <main>
      {/* ------------------------------------------------------------ hero */}
      <section className="mx-auto max-w-6xl px-6 pt-14 pb-10">
        <div className="grid items-end gap-10 lg:grid-cols-[1fr_1.25fr]">
          <div>
            <Label>Marktplaats voor tuinontwerpen</Label>
            <h1 className="display mt-5 text-[52px] text-ink sm:text-[64px]">
              Een tuin die
              <br />
              <span className="italic text-moss">al bedacht is.</span>
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-soft">
              Nederlandse ontwerpers publiceren hun tuinontwerpen en pakketten hier. Je koopt de
              tekening direct, met factuur, en de ontwerper wordt automatisch uitbetaald.
            </p>
            <div className="mt-8 flex items-center gap-6">
              <Link
                href="#ontwerpen"
                className="inline-flex h-11 items-center bg-moss px-6 text-[13.5px] font-medium text-paper transition-colors hover:bg-moss-mid">
                Bekijk {visible.length} ontwerpen
              </Link>
              <Link href="/studio" className="link-underline text-[13.5px] text-ink-soft">
                Ik ben ontwerper
              </Link>
            </div>
          </div>

          <figure className="relative">
            <div className="relative aspect-[5/4] w-full overflow-hidden">
              <Image
                src={gardens.villandry}
                alt="Strak aangelegde tuin met symmetrische perken van bovenaf gezien"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 55vw"
                className="object-cover"
              />
            </div>
            <figcaption className="absolute -bottom-px -left-px max-w-[15rem] border border-line bg-paper px-4 py-3">
              <p className="text-[12px] leading-snug text-ink-soft">
                Prijzen zijn inclusief 21% btw. De ontwerper ontvangt{' '}
                <span className="text-ink">{config.designerShareBp / 100}%</span> van het bedrag
                exclusief btw.
              </p>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ------------------------------------------------------- how it works */}
      <section className="border-y border-line bg-paper-2/60">
        <div className="mx-auto grid max-w-6xl gap-px bg-line px-6 sm:grid-cols-3">
          {[
            ['Koop de tekening', 'Zelfde afrekenen als altijd. Tuindirigent blijft de verkoper op je bon.'],
            ['Ontwerper krijgt betaald', `Automatische uitbetaling via Stripe, ${config.defaultHoldDays} dagen na de verkoop.`],
            ['Factuur klopt', 'Wij maken de btw-factuur namens de ontwerper, met doorlopende nummering.'],
          ].map(([title, body], i) => (
            <div key={title} className="bg-paper-2/60 px-0 py-8 sm:px-6">
              <span className="num text-[11px] text-ink-faint">0{i + 1}</span>
              <h3 className="display mt-2 text-[19px] text-ink">{title}</h3>
              <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-ink-soft">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- the grid */}
      <section id="ontwerpen" className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-8 flex items-end justify-between border-b border-line pb-3">
          <Label>Beschikbare ontwerpen</Label>
          {hidden > 0 ? (
            <span className="text-[12px] text-ink-faint">
              {hidden} verborgen door de uitrolvlag
            </span>
          ) : null}
        </div>

        <div className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((listing) => {
            const gate = checkSellGate(listing.designer);
            return (
              <article key={listing.id} className="group">
                <Link href={`/ontwerp/${listing.slug}`}>
                  <div className="relative aspect-[4/5] w-full overflow-hidden bg-paper-2">
                    <Image
                      src={listing.coverUrl}
                      alt={listing.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    />
                    {listing.type === 'PACKAGE' ? (
                      <span className="absolute left-3 top-3 bg-paper px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-moss">
                        Pakket
                      </span>
                    ) : null}
                    {!gate.ok ? (
                      <span className="absolute right-3 top-3 bg-gold-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-gold">
                        Niet te koop
                      </span>
                    ) : null}
                  </div>
                </Link>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="display text-[21px] leading-tight text-ink">
                      <Link href={`/ontwerp/${listing.slug}`} className="link-underline">
                        {listing.title}
                      </Link>
                    </h3>
                    <Money cents={listing.priceInclVatCents} className="shrink-0 text-[15px] text-ink" />
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{listing.summary}</p>
                  <p className="mt-3 text-[12px] text-ink-faint">
                    {listing.designer.studioName} · {listing.designer.city} · {listing.plotSize}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------- designers */}
      <section className="border-t border-line bg-paper-2/60">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-8 flex items-end justify-between border-b border-line pb-3">
            <Label>Ontwerpers</Label>
            <span className="text-[12px] text-ink-faint">{designers.length} studio&apos;s</span>
          </div>
          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {designers.map((d) => {
              const gate = checkSellGate(d);
              return (
                <div key={d.id} className="flex gap-4">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-paper">
                    <Image src={d.avatarUrl} alt={d.name} fill sizes="56px" className="object-cover" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="display text-[17px] text-ink">{d.studioName}</h3>
                    <p className="text-[12px] text-ink-faint">
                      {d.name} · {d.city}
                    </p>
                    <div className="mt-2">
                      {gate.ok ? (
                        <Pill tone="moss" dot>
                          Verkoopt
                        </Pill>
                      ) : (
                        <Pill tone="gold">{t(gate.failures[0].title)}</Pill>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-[12px] text-ink-faint">
          <span>
            {config.platformName} · btw {config.platformVatNumber}
          </span>
          <span>Demo-omgeving. Geen echte betalingen.</span>
        </div>
      </footer>
    </main>
  );
}
