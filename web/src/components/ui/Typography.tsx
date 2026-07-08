import type { ElementType, HTMLAttributes, ReactNode } from 'react';

export function Eyebrow({
  children,
  tone = 'muted',
  className = '',
}: {
  children: ReactNode;
  tone?: 'muted' | 'accent';
  className?: string;
}) {
  const toneClass = tone === 'accent' ? 'text-accent' : 'text-ink-muted';
  return (
    <p
      className={`font-mono text-[11px] font-medium uppercase tracking-[0.16em] ${toneClass} ${className}`}
    >
      {children}
    </p>
  );
}

type HeadingLevel = 'display' | 'h1' | 'h2' | 'h3';

const HEADING_STYLES: Record<HeadingLevel, string> = {
  display:
    'text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight',
  h1: 'text-3xl sm:text-4xl font-semibold leading-tight tracking-tight',
  h2: 'text-2xl font-semibold leading-tight tracking-tight',
  h3: 'text-lg font-semibold leading-snug tracking-tight',
};

const HEADING_TAGS: Record<HeadingLevel, ElementType> = {
  display: 'h1',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
};

export function Heading({
  level = 'h2',
  as,
  children,
  className = '',
  ...rest
}: {
  level?: HeadingLevel;
  as?: ElementType;
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLHeadingElement>, 'className' | 'children'>) {
  const Tag = as ?? HEADING_TAGS[level];
  return (
    <Tag
      className={`font-display text-ink ${HEADING_STYLES[level]} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function BodyText({
  children,
  muted = false,
  className = '',
}: {
  children: ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <p
      className={`text-[0.9375rem] leading-6 ${muted ? 'text-ink-muted' : 'text-ink'} ${className}`}
    >
      {children}
    </p>
  );
}

export function Mono({
  children,
  muted = true,
  className = '',
}: {
  children: ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[11px] uppercase tracking-[0.1em] ${muted ? 'text-ink-muted' : 'text-ink'} ${className}`}
    >
      {children}
    </span>
  );
}

type DataNumberSize = 'sm' | 'md' | 'lg' | 'xl';

const DATA_NUMBER_SIZES: Record<DataNumberSize, string> = {
  sm: 'text-xl',
  md: 'text-3xl',
  lg: 'text-5xl',
  xl: 'text-6xl',
};

export function DataNumber({
  children,
  size = 'md',
  tone = 'ink',
  className = '',
}: {
  children: ReactNode;
  size?: DataNumberSize;
  tone?: 'ink' | 'accent';
  className?: string;
}) {
  const toneClass = tone === 'accent' ? 'text-accent' : 'text-ink';
  return (
    <span
      className={`font-mono font-semibold leading-none tabular-nums ${DATA_NUMBER_SIZES[size]} ${toneClass} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * The range (low–high) is the ledger's honesty mechanism, not a formatting
 * detail — it must read as a deliberate range, never as a stray typo.
 */
export function CounterRange({
  low,
  high,
  size = 'md',
  className = '',
}: {
  low: number;
  high: number;
  size?: DataNumberSize;
  className?: string;
}) {
  const isRange = low !== high;
  return (
    <span className={`inline-flex items-baseline gap-2 ${className}`}>
      <DataNumber size={size} tone="accent">
        {isRange
          ? `${low.toLocaleString()}–${high.toLocaleString()}`
          : high.toLocaleString()}
      </DataNumber>
      {isRange && (
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
          range
        </span>
      )}
    </span>
  );
}
