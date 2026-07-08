import type { ReactNode } from 'react';
import { isCountableTier } from '../../../../shared/constants';

type BadgeTone = 'neutral' | 'accent' | 'outline';

const BADGE_TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-rule-strong bg-paper-sunken text-ink',
  accent: 'border-accent bg-accent-soft text-accent-strong',
  outline: 'border-rule text-ink-muted',
};

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ${BADGE_TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const TIER_LABELS: Record<string, string> = {
  institutional: 'Institutional',
  wire_service: 'Wire Service',
  established: 'Established',
  emerging_unverified: 'Emerging / Unverified',
};

/**
 * Tiers are differentiated by dot fill (countable vs. not), not by hue —
 * the one accent color is reserved for counts, never spent on badges.
 */
export function TierBadge({
  tier,
  className = '',
}: {
  tier: string | null;
  className?: string;
}) {
  if (!tier) {
    return (
      <Badge tone="outline" className={className}>
        <span className="h-1.5 w-1.5 rounded-full border border-ink-faint" />
        Unrated
      </Badge>
    );
  }

  const countable = isCountableTier(tier);
  const label = TIER_LABELS[tier] ?? tier.replaceAll('_', ' ');

  return (
    <Badge tone={countable ? 'neutral' : 'outline'} className={className}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${countable ? 'bg-ink' : 'border border-ink-faint'}`}
      />
      {label}
    </Badge>
  );
}
