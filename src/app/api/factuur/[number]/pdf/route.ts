import { chromium } from 'playwright-core';
import { prisma } from '@/lib/db';

/**
 * PDF rendering through headless Chrome against the same HTML the browser
 * shows, so the document people read and the document they file are the same
 * artefact. The print stylesheet in globals.css sets the A4 margins.
 *
 * In production this runs on a worker, not in the request path, and the result
 * is written to object storage once and served from there - an issued document
 * is immutable, so it only ever needs rendering a single time.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ number: string }> }) {
  const { number } = await ctx.params;
  const fullNumber = decodeURIComponent(number);

  const doc = await prisma.document.findUnique({ where: { fullNumber } });
  if (!doc) return new Response('Not found', { status: 404 });

  const executablePath =
    process.env.CHROMIUM_PATH ?? '/home/admin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

  let browser;
  try {
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  } catch {
    return new Response(
      'No Chromium available to render the PDF. Set CHROMIUM_PATH, or view the invoice in the browser and print to PDF.',
      { status: 503 },
    );
  }

  try {
    const origin = process.env.APP_ORIGIN ?? 'http://localhost:3100';
    const page = await browser.newPage();
    await page.goto(`${origin}/factuur/${encodeURIComponent(fullNumber)}`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fullNumber}.pdf"`,
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } finally {
    await browser.close();
  }
}
