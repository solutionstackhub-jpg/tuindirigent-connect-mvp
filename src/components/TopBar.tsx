'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/', label: 'Marktplaats' },
  { href: '/studio', label: 'Studio' },
  { href: '/admin', label: 'Beheer' },
];

export function TopBar() {
  const pathname = usePathname();
  const isInvoice = pathname?.startsWith('/factuur');
  if (isInvoice) return null;

  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-6">
        <Link href="/" className="flex items-baseline gap-[3px]">
          <span className="display text-[19px] font-semibold text-moss">Tuin</span>
          <span className="display text-[19px] font-normal italic text-ink">dirigent</span>
        </Link>

        <nav className="flex items-center gap-6">
          {nav.map((item) => {
            const active =
              item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-[13.5px] transition-colors ${
                  active ? 'text-ink' : 'text-ink-faint hover:text-ink'
                }`}>
                {item.label}
                {active ? <span className="mt-1 block h-px bg-moss" /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[11px] text-ink-faint sm:inline">
            Demo · Stripe testmodus
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-moss" />
        </div>
      </div>
    </header>
  );
}
