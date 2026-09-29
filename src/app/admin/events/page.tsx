import Link from 'next/link';
import { prisma } from '@/lib/db';
import { replayEvent } from '@/app/actions/sales';
import { Empty, Label, Pill, SpecNote } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  const events = await prisma.webhookEvent.findMany({ orderBy: { receivedAt: 'desc' }, take: 60 });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/admin" className="link-underline text-[12.5px] text-ink-faint">
        ← Beheer
      </Link>

      <h1 className="display mt-5 text-[34px] leading-tight text-ink">Webhooks</h1>
      <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-ink-soft">
        Twee endpoints: het bestaande platform-endpoint, dat er nu ook terugbetalingen en chargebacks
        bij krijgt, en een nieuw Connect-endpoint met een eigen signing secret. Abonnementen blijven
        ongemoeid.
      </p>

      <div className="mt-6">
        <SpecNote>
          Druk op <span className="font-medium">Opnieuw afspelen</span>. Het verwerkt precies dezelfde
          gebeurtenis nog een keer. Er komt geen tweede factuur bij, het factuurnummer schuift niet op
          en het grootboek verandert niet. Dat is de hele garantie, en die kun je hier zelf proberen.
        </SpecNote>
      </div>

      <div className="mt-8">
        <div className="mb-4 flex items-end justify-between border-b border-line pb-3">
          <Label>Ontvangen gebeurtenissen</Label>
          <span className="text-[12px] text-ink-faint">{events.length} recent</span>
        </div>

        {events.length === 0 ? (
          <Empty
            title="Nog niets ontvangen"
            body="Koop een ontwerp in de marktplaats; de gebeurtenissen van die verkoop verschijnen hier."
          />
        ) : (
          <div className="space-y-px bg-line">
            {events.map((e) => (
              <div key={e.id} className="flex flex-wrap items-start gap-4 bg-paper px-5 py-4">
                <div className="min-w-56 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num text-[13px] text-ink">{e.type}</span>
                    <Pill tone={e.endpoint === 'connect' ? 'clay' : 'plain'}>{e.endpoint}</Pill>
                    {e.replayCount > 0 ? <Pill tone="gold">{e.replayCount}× opnieuw</Pill> : null}
                  </div>
                  <p className="num mt-1 text-[11.5px] text-ink-faint">{e.id}</p>
                  {e.note ? (
                    <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink-soft">{e.note}</p>
                  ) : null}
                </div>

                <div className="text-right">
                  <p className="num text-[11.5px] text-ink-faint">
                    {e.receivedAt.toLocaleTimeString('nl-NL')}
                  </p>
                  <form action={replayEvent} className="mt-2">
                    <input type="hidden" name="eventId" value={e.id} />
                    <button className="border border-line px-3 py-1.5 text-[11.5px] text-ink-soft transition-colors hover:border-moss hover:text-moss">
                      Opnieuw afspelen
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
