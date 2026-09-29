/**
 * Replays every webhook this system has ever received, twice, and proves that
 * nothing moved: no extra invoice, no skipped number, no duplicated ledger row.
 *
 *   pnpm verify
 *
 * This is the check the client asked about in question 2 and question 5, run as
 * a script rather than described in prose.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function snapshot() {
  const [documents, ledger, purchases] = await Promise.all([
    prisma.document.findMany({ orderBy: { number: 'asc' }, select: { fullNumber: true, number: true, totalCents: true } }),
    prisma.ledgerEntry.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, amountCents: true } }),
    prisma.purchase.findMany({ select: { id: true, status: true, refundedCents: true, reversedCents: true } }),
  ]);
  return {
    documents,
    ledgerCount: ledger.length,
    ledgerSum: ledger.reduce((s, l) => s + l.amountCents, 0),
    purchases,
  };
}

function gapsIn(numbers: number[]) {
  const gaps: number[] = [];
  for (let i = 1; i < numbers.length; i += 1) {
    for (let n = numbers[i - 1] + 1; n < numbers[i]; n += 1) gaps.push(n);
  }
  return gaps;
}

async function main() {
  const { process: processEvent } = await import('../src/lib/services/webhooks');

  const before = await snapshot();
  const events = await prisma.webhookEvent.findMany({ orderBy: { receivedAt: 'asc' } });

  console.log(`Replaying ${events.length} events, twice, in original and reverse order.`);

  for (const event of events) await processEvent(event.id);
  for (const event of [...events].reverse()) await processEvent(event.id);

  const after = await snapshot();

  const numbers = after.documents.map((d) => d.number);
  const gaps = gapsIn(numbers);
  const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);

  const checks: Array<[string, boolean, string]> = [
    [
      'document count unchanged',
      before.documents.length === after.documents.length,
      `${before.documents.length} -> ${after.documents.length}`,
    ],
    [
      'document numbers unchanged',
      JSON.stringify(before.documents) === JSON.stringify(after.documents),
      after.documents.map((d) => d.fullNumber).join(', ') || 'none',
    ],
    ['numbering has no gaps', gaps.length === 0, gaps.length ? `gaps at ${gaps.join(', ')}` : 'contiguous'],
    [
      'numbering has no duplicates',
      duplicates.length === 0,
      duplicates.length ? `repeated ${duplicates.join(', ')}` : 'unique',
    ],
    [
      'ledger rows unchanged',
      before.ledgerCount === after.ledgerCount,
      `${before.ledgerCount} -> ${after.ledgerCount}`,
    ],
    [
      'ledger balance unchanged',
      before.ledgerSum === after.ledgerSum,
      `${(before.ledgerSum / 100).toFixed(2)} -> ${(after.ledgerSum / 100).toFixed(2)} EUR`,
    ],
    [
      'purchase states unchanged',
      JSON.stringify(before.purchases) === JSON.stringify(after.purchases),
      `${after.purchases.length} purchases`,
    ],
  ];

  console.log('');
  let failed = 0;
  for (const [name, ok, detail] of checks) {
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} ${detail}`);
  }

  console.log(
    failed === 0
      ? '\nReplaying every webhook twice changed nothing.'
      : `\n${failed} check(s) failed.`,
  );
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
