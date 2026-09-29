import Link from 'next/link';
import type { ReactNode } from 'react';
import { euro } from '@/domain/money';

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`label ${className}`}>{children}</p>;
}

export function Money({
  cents,
  className = '',
  sign = false,
}: {
  cents: number;
  className?: string;
  sign?: boolean;
}) {
  const prefix = sign && cents > 0 ? '+' : '';
  return (
    <span className={`num ${className}`}>
      {prefix}
      {euro(cents)}
    </span>
  );
}

const TONES = {
  moss: 'bg-moss-soft text-moss border-moss-line',
  clay: 'bg-clay-soft text-clay border-clay/25',
  gold: 'bg-gold-soft text-gold border-gold/25',
  rose: 'bg-rose-soft text-rose border-rose/25',
  plain: 'bg-paper-2 text-ink-soft border-line',
} as const;

export function Pill({
  children,
  tone = 'plain',
  dot = false,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.1em] ${TONES[tone]}`}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function Button({
  children,
  href,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
  className = '',
  full,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
  full?: boolean;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 px-5 h-11 text-[13.5px] font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none';
  const look = {
    primary: 'bg-moss text-paper hover:bg-moss-mid',
    secondary: 'border border-line bg-card text-ink hover:border-ink-faint',
    ghost: 'text-ink-soft hover:text-ink',
    danger: 'border border-rose/30 bg-rose-soft text-rose hover:border-rose/60',
  }[variant];
  const cls = `${base} ${look} ${full ? 'w-full' : ''} ${className}`;

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

export function Section({
  title,
  aside,
  children,
  className = '',
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-5 flex items-end justify-between gap-4 border-b border-line pb-3">
        <Label>{title}</Label>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2">
      <span className="text-[13px] text-ink-faint">{label}</span>
      <span className={`text-[13.5px] text-ink ${mono ? 'num' : ''}`}>{value}</span>
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-dashed border-line px-6 py-14 text-center">
      <p className="display text-[20px] text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-faint">{body}</p>
    </div>
  );
}

/** Short aside explaining what the production system does at this point. */
export function SpecNote({ children }: { children: ReactNode }) {
  return (
    <aside className="border-l-2 border-moss-line bg-moss-soft/40 px-4 py-3 text-[12.5px] leading-relaxed text-moss">
      {children}
    </aside>
  );
}
