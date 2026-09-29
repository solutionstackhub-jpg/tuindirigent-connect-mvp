import Image from 'next/image';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { euro } from '@/domain/money';
import { renderLedgerReason } from '@/domain/messages';
import { checkSellGate, t } from '@/lib/services/gates';
import { disputeSale, markPaidOut, refundSale } from '@/app/actions/sales';
import { Empty, Label, Pill, Section, SpecNote } from '@/components/ui';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: 'moss' | 'gold' | 'rose' | 'plain' }> = {
  PENDING: { label: 'Wacht op betaling', tone: 'plain' },
  PAID: { label: 'Betaald', tone: 'moss' },
  PARTIALLY_REFUNDED: { label: 'Deels terugbetaald', tone: 'gold' },
  REFUNDED: { label: 'Terugbetaald', tone: 'rose' },
  DISPUTE_OPEN: { label: 'Chargeback open', tone: 'rose' },
  DISPUTE_WON: { label: 'Chargeback gewonnen', tone: 'moss' },
  DISPUTE_LOST: { label: 'Chargeback verloren', tone: 'rose' },
};

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const designers = await prisma.designer.findMany({ orderBy: { createdAt: 'asc' } });
  const designer = designers.find((x) => x.slug === d) ?? designers[0];

  const [purchases, ledger, documents, config] = await Promise.all([
    prisma.purchase.findMany({
      where: { designerId: designer.id },
      include: { listing: true, documents: true, ledger: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.ledgerEntry.findMany({
      where: { designerId: designer.id },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    prisma.document.findMany({ where: { designerId: designer.id }, orderBy: { number: 'desc' } }),
    prisma.config.findFirstOrThrow(),
  ]);

  const gate = checkSellGate(designer);
  const earned = ledger.reduce((sum, l) => sum + l.amountCents, 0);
  const paidSales = purchases.filter((p) => p.status !== 'PENDING');
  const holdDays = designer.holdDaysOverride ?? config.defaultHoldDays;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {/* ------------------------------------------------- who am I (demo) */}
      <div className="no-print mb-8 flex flex-wrap items-center gap-2 border border-dashed border-line px-4 py-3">
        <span className="text-[11.5px] text-ink-faint">Demo · bekijk als:</span>
        {designers.map((x) => (
          <Link
            key={x.id}
            href={`/studio?d=${x.slug}`}
            className={`px-2.5 py-1 text-[12px] transition-colors ${
              x.id === designer.id ? 'bg-moss text-paper' : 'text-ink-soft hover:text-ink'
            }`}>
            {x.studioName}
          </Link>
        ))}
      </div>

      {/* ----------------------------------------------------------- header */}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-paper-2">
            <Image src={designer.avatarUrl} alt="" fill sizes="64px" className="object-cover" />
          </div>
          <div>
            <h1 className="display text-[32px] leading-tight text-ink">{designer.studioName}</h1>
            <p className="text-[13px] text-ink-faint">
              {designer.name} · {designer.city}
              {designer.vatNumber ? <span className="num"> · {designer.vatNumber}</span> : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {gate.ok ? (
                <Pill tone="moss" dot>
                  Verkoopt
                </Pill>
              ) : (
                gate.failures.map((f) => (
                  <Pill key={f.key} tone="gold">
                    {t(f.title)}
                  </Pill>
                ))
              )}
              {designer.payoutsOnHold ? <Pill tone="rose">Uitbetaling geblokkeerd</Pill> : null}
            </div>
          </div>
        </div>

        <Link
          href="/studio/onboarding"
          className="flex h-11 items-center border border-line bg-card px-5 text-[13.5px] text-ink transition-colors hover:border-ink-faint">
          Stripe &amp; facturatie
        </Link>
      </header>

      {/* ------------------------------------------------------ gate banner */}
      {!gate.ok ? (
        <div className="mt-8 border border-gold/30 bg-gold-soft/70 px-6 py-5">
          <p className="text-[14px] font-medium text-gold">
            Je kunt nog niet publiceren of verkopen
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {gate.failures.map((f) => (
              <div key={f.key}>
                <p className="text-[13px] text-ink">{t(f.title)}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{t(f.detail)}</p>
                <Link href={f.href} className="link-underline mt-2 inline-block text-[12.5px] text-moss">
                  {t(f.action)} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------------ stats */}
      <div className="mt-10 grid gap-px border border-line bg-line sm:grid-cols-4">
        {[
          ['Verkopen', String(paidSales.length), 'betaalde bestellingen'],
          ['Netto ontvangen', euro(earned), 'na correcties'],
          [
            'Openstaand saldo',
            euro(-designer.carriedBalanceCents),
            designer.carriedBalanceCents > 0 ? 'wordt van je volgende verkoop afgehaald' : 'niets openstaand',
          ],
          ['Uitbetaaltermijn', `${holdDays} dagen`, designer.holdDaysOverride ? 'aangepast door beheer' : 'standaard'],
        ].map(([label, value, hint]) => (
          <div key={label} className="bg-paper px-5 py-6">
            <Label>{label}</Label>
            <p className="num mt-2 text-[24px] text-ink">{value}</p>
            <p className="mt-1 text-[11.5px] text-ink-faint">{hint}</p>
          </div>
        ))}
      </div>

      {/* ----------------------------------------------------------- sales */}
      <Section title="Verkopen" className="mt-14">
        {paidSales.length === 0 ? (
          <Empty
            title="Nog geen verkopen"
            body="Zodra iemand een ontwerp koopt verschijnt hier de verkoop, de uitbetaling en de factuur."
          />
        ) : (
          <div className="space-y-px bg-line">
            {paidSales.map((p) => {
              const status = STATUS[p.status];
              const reductions = p.ledger.filter((l) => l.amountCents < 0);
              const net = p.ledger.reduce((s, l) => s + l.amountCents, 0);
              const invoice = p.documents.find((x) => x.type === 'INVOICE');
              const credits = p.documents.filter((x) => x.type === 'CREDIT_NOTE');

              return (
                <div key={p.id} className="bg-paper px-5 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex gap-4">
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden bg-paper-2">
                        <Image src={p.listing.coverUrl} alt="" fill sizes="56px" className="object-cover" />
                      </div>
                      <div>
                        <p className="text-[14.5px] text-ink">{p.listing.title}</p>
                        <p className="text-[12px] text-ink-faint">
                          {p.buyerName} · {p.createdAt.toLocaleDateString('nl-NL')} ·{' '}
                          {p.paymentMethod === 'ideal' ? 'iDEAL' : 'kaart'}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Pill tone={status.tone}>{status.label}</Pill>
                          {invoice ? (
                            <Link
                              href={`/factuur/${invoice.fullNumber}`}
                              className="num link-underline text-[11.5px] text-moss">
                              {invoice.fullNumber}
                            </Link>
                          ) : null}
                          {credits.map((c) => (
                            <Link
                              key={c.id}
                              href={`/factuur/${c.fullNumber}`}
                              className="num link-underline text-[11.5px] text-clay">
                              {c.fullNumber}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="num text-[19px] text-ink">{euro(net)}</p>
                      <p className="text-[11.5px] text-ink-faint">
                        van {euro(p.transferCents)} overgeboekt
                      </p>
                      {p.payoutHoldUntil && p.status === 'PAID' ? (
                        <p className="mt-1 text-[11.5px] text-ink-faint">
                          uitbetaling {p.payoutHoldUntil.toLocaleDateString('nl-NL')}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* A designer must always be able to see why a payout was reduced. */}
                  {reductions.length > 0 ? (
                    <ul className="mt-4 space-y-1 border-t border-line-soft pt-3">
                      {reductions.map((l) => (
                        <li key={l.id} className="flex justify-between gap-6 text-[12px]">
                          <span className="text-ink-soft">{renderLedgerReason(l.reasonKey, l.reasonParams)}</span>
                          <span className="num shrink-0 text-clay">{euro(l.amountCents)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {/* Demo controls: in production refunds are issued in the Stripe dashboard. */}
                  <div className="no-print mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3">
                    <span className="text-[11px] text-ink-faint">Demo:</span>
                    <form action={refundSale}>
                      <input type="hidden" name="purchaseId" value={p.id} />
                      <input type="hidden" name="share" value="half" />
                      <button className="border border-line px-2.5 py-1 text-[11.5px] text-ink-soft hover:border-ink-faint">
                        Helft terugbetalen
                      </button>
                    </form>
                    <form action={refundSale}>
                      <input type="hidden" name="purchaseId" value={p.id} />
                      <input type="hidden" name="share" value="full" />
                      <button className="border border-line px-2.5 py-1 text-[11.5px] text-ink-soft hover:border-ink-faint">
                        Volledig terugbetalen
                      </button>
                    </form>
                    <form action={markPaidOut.bind(null, p.id)}>
                      <button className="border border-line px-2.5 py-1 text-[11.5px] text-ink-soft hover:border-ink-faint">
                        {p.paidOutAt ? 'Al uitbetaald ✓' : 'Markeer als uitbetaald'}
                      </button>
                    </form>
                    <form action={disputeSale}>
                      <input type="hidden" name="purchaseId" value={p.id} />
                      <input type="hidden" name="outcome" value="open" />
                      <button className="border border-line px-2.5 py-1 text-[11.5px] text-ink-soft hover:border-ink-faint">
                        Chargeback openen
                      </button>
                    </form>
                    <form action={disputeSale}>
                      <input type="hidden" name="purchaseId" value={p.id} />
                      <input type="hidden" name="outcome" value="won" />
                      <button className="border border-line px-2.5 py-1 text-[11.5px] text-ink-soft hover:border-ink-faint">
                        Gewonnen
                      </button>
                    </form>
                    <form action={disputeSale}>
                      <input type="hidden" name="purchaseId" value={p.id} />
                      <input type="hidden" name="outcome" value="lost" />
                      <button className="border border-line px-2.5 py-1 text-[11.5px] text-ink-soft hover:border-ink-faint">
                        Verloren
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* -------------------------------------------------------- documents */}
      <Section
        title="Facturen en creditfacturen"
        className="mt-14"
        aside={<span className="text-[12px] text-ink-faint">{documents.length} documenten</span>}>
        {documents.length === 0 ? (
          <Empty
            title="Nog geen facturen"
            body="Bij elke verkoop maken wij namens jou een btw-factuur. Bij een terugbetaling volgt automatisch een creditfactuur."
          />
        ) : (
          <div className="space-y-px bg-line">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/factuur/${doc.fullNumber}`}
                className="flex items-center justify-between gap-4 bg-paper px-5 py-4 transition-colors hover:bg-paper-2/70">
                <div className="flex items-center gap-4">
                  <span className="num text-[13px] text-ink">{doc.fullNumber}</span>
                  <Pill tone={doc.type === 'INVOICE' ? 'plain' : 'clay'}>
                    {doc.type === 'INVOICE' ? 'Factuur' : 'Credit'}
                  </Pill>
                  <span className="text-[12.5px] text-ink-soft">{doc.description}</span>
                </div>
                <span className="num text-[13.5px] text-ink">
                  {doc.type === 'CREDIT_NOTE' ? '−' : ''}
                  {euro(doc.totalCents)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <div className="mt-10">
        <SpecNote>
          Elke regel hierboven komt uit het grootboek, niet uit een berekening op het scherm. Wat de
          ontwerper ziet is precies wat er bij Stripe is gebeurd.
        </SpecNote>
      </div>
    </main>
  );
}
