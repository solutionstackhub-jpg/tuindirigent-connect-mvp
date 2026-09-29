import Image from 'next/image';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { computeSplit, euro } from '@/domain/money';
import { auditSeries } from '@/lib/services/invoicing';
import { checkSellGate, t } from '@/lib/services/gates';
import { setHoldDays, setVatRate, toggleListingFlag, togglePayoutHold } from '@/app/actions/designer';
import { Label, Pill, Section, SpecNote } from '@/components/ui';

export const dynamic = 'force-dynamic';

const CONNECT_TONE = {
  READY: 'moss',
  UNDER_REVIEW: 'gold',
  INCOMPLETE: 'gold',
  RESTRICTED: 'rose',
  NOT_STARTED: 'plain',
} as const;

export default async function AdminPage() {
  const config = await prisma.config.findFirstOrThrow();
  const designers = await prisma.designer.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { purchases: true } } },
  });
  const audit = await auditSeries(config.invoiceSeries);
  const events = await prisma.webhookEvent.count();

  const totals = await prisma.purchase.aggregate({
    where: { status: { not: 'PENDING' } },
    _sum: { grossCents: true, applicationFeeCents: true, transferCents: true, refundedCents: true },
    _count: true,
  });

  const example = computeSplit(12_100, {
    vatRateBp: config.vatRateBp,
    designerShareBp: config.designerShareBp,
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[34px] leading-tight text-ink">Beheer</h1>
          <p className="mt-1 text-[13.5px] text-ink-faint">
            {config.platformName} · btw <span className="num">{config.platformVatNumber}</span>
          </p>
        </div>
        <Link
          href="/admin/events"
          className="flex h-11 items-center border border-line bg-card px-5 text-[13.5px] text-ink transition-colors hover:border-ink-faint">
          Webhooks ({events})
        </Link>
      </header>

      {/* ----------------------------------------------------------- totals */}
      <div className="mt-10 grid gap-px border border-line bg-line sm:grid-cols-4">
        {[
          ['Verkopen', String(totals._count)],
          ['Omzet incl. btw', euro(totals._sum.grossCents ?? 0)],
          ['Platformdeel', euro(totals._sum.applicationFeeCents ?? 0)],
          ['Terugbetaald', euro(totals._sum.refundedCents ?? 0)],
        ].map(([label, value]) => (
          <div key={label} className="bg-paper px-5 py-6">
            <Label>{label}</Label>
            <p className="num mt-2 text-[24px] text-ink">{value}</p>
          </div>
        ))}
      </div>

      {/* ----------------------------------------------------------- config */}
      <Section title="Instellingen" className="mt-14">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          <form action={setVatRate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Btw-tarief %</Label>
                <input
                  name="vatRate"
                  type="number"
                  step="0.01"
                  defaultValue={config.vatRateBp / 100}
                  className="num mt-2 h-11 w-full border border-line bg-card px-3 text-[14px] outline-none focus:border-moss"
                />
              </div>
              <div>
                <Label>Deel ontwerper %</Label>
                <input
                  name="share"
                  type="number"
                  step="0.01"
                  defaultValue={config.designerShareBp / 100}
                  className="num mt-2 h-11 w-full border border-line bg-card px-3 text-[14px] outline-none focus:border-moss"
                />
              </div>
              <div>
                <Label>Wachttermijn dagen</Label>
                <input
                  name="holdDays"
                  type="number"
                  defaultValue={config.defaultHoldDays}
                  className="num mt-2 h-11 w-full border border-line bg-card px-3 text-[14px] outline-none focus:border-moss"
                />
              </div>
            </div>
            <button className="h-11 bg-moss px-6 text-[13.5px] font-medium text-paper transition-colors hover:bg-moss-mid">
              Opslaan
            </button>
            <p className="text-[12px] leading-relaxed text-ink-faint">
              Het btw-tarief komt uit deze instelling, niet uit de code. Wijzigingen gelden alleen voor
              nieuwe verkopen: bestaande verkopen en facturen houden het tarief dat op dat moment gold.
            </p>
          </form>

          <div className="border border-line bg-card p-5">
            <Label>Zo valt een verkoop van {euro(12_100)} uiteen</Label>
            <dl className="mt-3 space-y-1.5 text-[12.5px]">
              {[
                ['Koper betaalt', example.grossCents],
                [`Btw ${config.vatRateBp / 100}%`, example.vatCents],
                ['Exclusief btw', example.netCents],
                ['Ontwerper excl. btw', example.designerNetCents],
                ['Btw-opslag ontwerper', example.designerVatCents],
                ['Overboeking (transfer)', example.transferCents],
                ['application_fee_amount', example.applicationFeeCents],
              ].map(([label, cents]) => (
                <div key={label as string} className="flex justify-between gap-4">
                  <dt className="text-ink-faint">{label}</dt>
                  <dd className="num text-ink">{euro(cents as number)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-line pt-1.5">
                <dt className="text-moss">Netto marge platform</dt>
                <dd className="num text-moss">{euro(example.platformMarginCents)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
              De marge is {euro(example.platformMarginCents)} bij elk btw-tarief. Dat is de invariant
              waar de testsuite op staat.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-line bg-card px-5 py-4">
          <div>
            <p className="text-[13.5px] text-ink">
              Verberg ontwerpen van ontwerpers die niet uitbetaald kunnen worden
            </p>
            <p className="mt-1 text-[12px] text-ink-faint">
              Uitrolvlag. Staat nu {config.hideUnonboardedList ? 'aan' : 'uit'}.
            </p>
          </div>
          <form action={toggleListingFlag}>
            <button
              className={`h-10 px-5 text-[13px] font-medium transition-colors ${
                config.hideUnonboardedList
                  ? 'bg-moss text-paper hover:bg-moss-mid'
                  : 'border border-line text-ink hover:border-ink-faint'
              }`}>
              {config.hideUnonboardedList ? 'Aan' : 'Uit'}
            </button>
          </form>
        </div>
      </Section>

      {/* -------------------------------------------------------- designers */}
      <Section title="Ontwerpers" className="mt-14">
        <div className="space-y-px bg-line">
          {designers.map((designer) => {
            const gate = checkSellGate(designer);
            return (
              <div key={designer.id} className="flex flex-wrap items-center gap-4 bg-paper px-5 py-4">
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-paper-2">
                  <Image src={designer.avatarUrl} alt="" fill sizes="44px" className="object-cover" />
                </div>

                <div className="min-w-48 flex-1">
                  <p className="text-[14px] text-ink">{designer.studioName}</p>
                  <p className="num text-[11.5px] text-ink-faint">
                    {designer.stripeAccountId ?? 'geen Stripe-account'} · {designer._count.purchases} verkopen
                  </p>
                </div>

                <div className="flex min-w-44 flex-wrap gap-1.5">
                  <Pill tone={CONNECT_TONE[designer.connectStatus]}>{designer.connectStatus}</Pill>
                  {designer.vatNumberValid ? (
                    <Pill tone="moss">btw ok</Pill>
                  ) : (
                    <Pill tone="gold">geen btw</Pill>
                  )}
                  {designer.selfBillingAcceptedAt ? null : <Pill tone="gold">geen akkoord</Pill>}
                </div>

                <div className="min-w-32 text-right">
                  {designer.carriedBalanceCents > 0 ? (
                    <p className="num text-[13px] text-clay">
                      −{euro(designer.carriedBalanceCents)} saldo
                    </p>
                  ) : (
                    <p className="text-[12px] text-ink-faint">geen saldo</p>
                  )}
                  {!gate.ok ? (
                    <p className="text-[11px] text-ink-faint">{t(gate.failures[0].title)}</p>
                  ) : null}
                </div>

                <form action={setHoldDays} className="flex items-center gap-2">
                  <input type="hidden" name="designerId" value={designer.id} />
                  <input
                    name="holdDays"
                    type="number"
                    placeholder={String(config.defaultHoldDays)}
                    defaultValue={designer.holdDaysOverride ?? ''}
                    className="num h-9 w-16 border border-line bg-card px-2 text-[12.5px] outline-none focus:border-moss"
                  />
                  <button className="h-9 border border-line px-3 text-[12px] text-ink-soft hover:border-ink-faint">
                    dagen
                  </button>
                </form>

                <form action={togglePayoutHold}>
                  <input type="hidden" name="designerId" value={designer.id} />
                  <button
                    className={`h-9 px-3 text-[12px] transition-colors ${
                      designer.payoutsOnHold
                        ? 'border border-rose/40 bg-rose-soft text-rose'
                        : 'border border-line text-ink-soft hover:border-ink-faint'
                    }`}>
                    {designer.payoutsOnHold ? 'Geblokkeerd' : 'Blokkeer'}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ------------------------------------------------------ numbering */}
      <Section
        title="Factuurreeks"
        className="mt-14"
        aside={
          <a
            href="/api/export/facturen"
            className="link-underline text-[12.5px] text-moss">
            Exporteer CSV voor de boekhouding
          </a>
        }>
        <div className="grid gap-px border border-line bg-line sm:grid-cols-4">
          {[
            ['Reeks', audit.series],
            ['Documenten', String(audit.count)],
            ['Laatste nummer', audit.last ? String(audit.last).padStart(6, '0') : '—'],
            [
              'Controle',
              audit.gaps.length === 0 && audit.duplicates.length === 0 ? 'geen gaten' : 'PROBLEEM',
            ],
          ].map(([label, value]) => (
            <div key={label} className="bg-paper px-5 py-5">
              <Label>{label}</Label>
              <p className="num mt-2 text-[18px] text-ink">{value}</p>
            </div>
          ))}
        </div>

        {audit.gaps.length > 0 || audit.duplicates.length > 0 ? (
          <p className="mt-4 border-l-2 border-rose bg-rose-soft px-4 py-3 text-[13px] text-rose">
            Gaten: {audit.gaps.join(', ') || 'geen'} · dubbel: {audit.duplicates.join(', ') || 'geen'}
          </p>
        ) : (
          <div className="mt-5">
            <SpecNote>
              De reeks wordt geteld met een rijvergrendeling op een tellerrij, in dezelfde transactie
              als het document zelf. Daarom kan een opnieuw afgeleverde webhook geen nummer overslaan
              en geen tweede factuur maken.
            </SpecNote>
          </div>
        )}
      </Section>
    </main>
  );
}
