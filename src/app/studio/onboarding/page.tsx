import Link from 'next/link';
import { prisma } from '@/lib/db';
import { advanceOnboarding } from '@/app/actions/sales';
import { acceptSelfBilling, saveVatNumber } from '@/app/actions/designer';
import { checkSellGate, t } from '@/lib/services/gates';
import { Label, Pill, Section, SpecNote } from '@/components/ui';

export const dynamic = 'force-dynamic';

const STAGES = [
  { key: 'NOT_STARTED', stage: 'created', label: 'Nog niet begonnen', body: 'Er is nog geen Stripe-account aangemaakt.' },
  { key: 'INCOMPLETE', stage: 'submitted', label: 'Onvolledig', body: 'Stripe mist nog gegevens, meestal een rekeningnummer of legitimatie.' },
  { key: 'UNDER_REVIEW', stage: 'under_review', label: 'In beoordeling', body: 'Stripe controleert je gegevens. Je hoeft nu niets te doen.' },
  { key: 'READY', stage: 'enabled', label: 'Klaar', body: 'Je kunt publiceren, verkopen en uitbetaald worden.' },
  { key: 'RESTRICTED', stage: 'restricted', label: 'Beperkt', body: 'Stripe heeft je account geblokkeerd tot je een document aanlevert.' },
] as const;

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; vatError?: string; vatOk?: string }>;
}) {
  const { d, vatError, vatOk } = await searchParams;
  const designers = await prisma.designer.findMany({ orderBy: { createdAt: 'asc' } });
  const designer = designers.find((x) => x.slug === d) ?? designers[0];
  const config = await prisma.config.findFirstOrThrow();
  const gate = checkSellGate(designer);

  const currentIndex = STAGES.findIndex((s) => s.key === designer.connectStatus);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="no-print mb-8 flex flex-wrap items-center gap-2 border border-dashed border-line px-4 py-3">
        <span className="text-[11.5px] text-ink-faint">Demo · bekijk als:</span>
        {designers.map((x) => (
          <Link
            key={x.id}
            href={`/studio/onboarding?d=${x.slug}`}
            className={`px-2.5 py-1 text-[12px] transition-colors ${
              x.id === designer.id ? 'bg-moss text-paper' : 'text-ink-soft hover:text-ink'
            }`}>
            {x.studioName}
          </Link>
        ))}
      </div>

      <Link href={`/studio?d=${designer.slug}`} className="link-underline text-[12.5px] text-ink-faint">
        ← Terug naar de studio
      </Link>

      <h1 className="display mt-5 text-[36px] leading-tight text-ink">Uitbetaling en facturatie</h1>
      <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-soft">
        Drie dingen moeten kloppen voordat je mag verkopen. Hieronder zie je precies welke.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {gate.ok ? (
          <Pill tone="moss" dot>
            Alles in orde
          </Pill>
        ) : (
          gate.failures.map((f) => (
            <Pill key={f.key} tone="gold">
              {t(f.title)}
            </Pill>
          ))
        )}
      </div>

      {/* --------------------------------------------------- 1. Stripe */}
      <Section title="1 · Stripe Express" className="mt-12">
        <div className="space-y-px bg-line">
          {STAGES.map((s, i) => {
            const active = s.key === designer.connectStatus;
            const passed = i < currentIndex && s.key !== 'RESTRICTED';
            return (
              <div
                key={s.key}
                className={`flex flex-wrap items-center justify-between gap-4 px-5 py-4 ${
                  active ? 'bg-moss-soft' : 'bg-paper'
                }`}>
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      active ? 'bg-moss' : passed ? 'bg-moss-line' : 'bg-line'
                    }`}
                  />
                  <div>
                    <p className={`text-[14px] ${active ? 'text-moss' : 'text-ink'}`}>{s.label}</p>
                    <p className="mt-0.5 max-w-lg text-[12.5px] leading-relaxed text-ink-soft">{s.body}</p>
                    {active && designer.requirementsDue.length > 0 ? (
                      <p className="num mt-1 text-[11.5px] text-clay">
                        Openstaand: {designer.requirementsDue.join(', ')}
                      </p>
                    ) : null}
                  </div>
                </div>

                {!active ? (
                  <form action={advanceOnboarding}>
                    <input type="hidden" name="designerId" value={designer.id} />
                    <input type="hidden" name="stage" value={s.stage} />
                    <button className="border border-line px-3 py-1.5 text-[11.5px] text-ink-soft hover:border-ink-faint">
                      Demo: zet op {s.label.toLowerCase()}
                    </button>
                  </form>
                ) : (
                  <span className="text-[11px] uppercase tracking-[0.1em] text-moss">huidige status</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5">
          <SpecNote>
            In productie opent deze pagina een Stripe-hosted Account Link. De status hier komt uit
            <span className="num"> account.updated</span> op het Connect-endpoint, nooit uit de app zelf.
          </SpecNote>
        </div>
      </Section>

      {/* ------------------------------------------------------- 2. BTW */}
      <Section title="2 · Btw-nummer" className="mt-14">
        <form action={saveVatNumber} className="max-w-xl space-y-4">
          <input type="hidden" name="designerId" value={designer.id} />
          <input type="hidden" name="slug" value={designer.slug} />

          <div>
            <Label>Btw-identificatienummer</Label>
            <input
              name="vatNumber"
              defaultValue={designer.vatNumber ?? ''}
              placeholder="NL123456782B01"
              className="num mt-2 h-11 w-full border border-line bg-card px-3 text-[14px] outline-none focus:border-moss"
            />
            {vatError ? <p className="mt-2 text-[12.5px] text-rose">{vatError}</p> : null}
            {vatOk ? <p className="mt-2 text-[12.5px] text-moss">Nummer opgeslagen en gecontroleerd.</p> : null}
            {!vatError && !vatOk ? (
              <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
                We controleren de opbouw en het controlecijfer (elfproef) voordat je kunt verkopen.
              </p>
            ) : null}
          </div>

          <div>
            <Label>Vestigingsadres</Label>
            <input
              name="address"
              defaultValue={designer.address ?? ''}
              placeholder="Straat 1, 1000 AA Amsterdam"
              className="mt-2 h-11 w-full border border-line bg-card px-3 text-[14px] outline-none focus:border-moss"
            />
            <p className="mt-2 text-[12px] text-ink-faint">Komt op elke factuur die wij namens je maken.</p>
          </div>

          <button className="h-11 bg-moss px-6 text-[13.5px] font-medium text-paper transition-colors hover:bg-moss-mid">
            Opslaan
          </button>
        </form>
      </Section>

      {/* ---------------------------------------------- 3. self-billing */}
      <Section title="3 · Zelffacturering" className="mt-14">
        <div className="max-w-2xl">
          <p className="text-[14px] leading-relaxed text-ink-soft">
            Tuindirigent maakt bij elke verkoop de btw-factuur namens jou en stuurt die aan zichzelf.
            Dat mag alleen met jouw akkoord vooraf. Wij leggen de datum en de versie van de voorwaarden
            vast, en zonder akkoord kun je niet verkopen.
          </p>

          <div className="mt-5 max-h-44 overflow-y-auto border border-line bg-card px-5 py-4 text-[12.5px] leading-relaxed text-ink-soft">
            <p className="text-ink">Zelffactureringsovereenkomst {config.selfBillingTerms}</p>
            <p className="mt-2">
              1. De ontwerper (leverancier) machtigt Tuindirigent B.V. (afnemer) om namens hem of haar
              facturen uit te reiken voor alle via het platform tot stand gekomen verkopen.
            </p>
            <p className="mt-2">
              2. Facturen worden uitgereikt in een doorlopende, aaneengesloten nummerreeks en voldoen
              aan de eisen van artikel 35a van de Wet op de omzetbelasting 1968.
            </p>
            <p className="mt-2">
              3. De leverancier controleert elke factuur en meldt onjuistheden binnen veertien dagen.
              Bij uitblijven van bezwaar wordt de factuur geacht te zijn aanvaard.
            </p>
            <p className="mt-2">
              4. Bij een terugbetaling of een verloren chargeback reikt de afnemer automatisch een
              creditfactuur uit die naar de oorspronkelijke factuur verwijst.
            </p>
            <p className="mt-2">
              5. Deze overeenkomst eindigt zodra een van beide partijen dit schriftelijk meldt. Reeds
              uitgereikte facturen blijven ongewijzigd.
            </p>
            <p className="mt-3 opacity-60">
              English summary: you authorise Tuindirigent to issue VAT invoices on your behalf for every
              sale made through the platform, in a gap-free sequential series, with credit notes issued
              automatically for refunds and lost disputes.
            </p>
          </div>

          {designer.selfBillingAcceptedAt ? (
            <p className="mt-5 border-l-2 border-moss-line bg-moss-soft/50 px-4 py-3 text-[13px] text-moss">
              Geaccepteerd op{' '}
              <span className="num">
                {designer.selfBillingAcceptedAt.toLocaleDateString('nl-NL', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>{' '}
              · versie <span className="num">{designer.selfBillingVersion}</span>
            </p>
          ) : (
            <form action={acceptSelfBilling} className="mt-5">
              <input type="hidden" name="designerId" value={designer.id} />
              <button className="h-11 bg-moss px-6 text-[13.5px] font-medium text-paper transition-colors hover:bg-moss-mid">
                Ik ga akkoord met versie {config.selfBillingTerms}
              </button>
            </form>
          )}
        </div>
      </Section>
    </main>
  );
}
