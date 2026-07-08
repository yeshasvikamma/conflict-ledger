import { Badge } from './ui/Badge';

/**
 * Flags an event where trusted sources report different counts. Disagreement
 * is a first-class state, not an error — this is the only other place besides
 * a counter's range that spends the accent color.
 */
export function DisagreementBadge({ className = '' }: { className?: string }) {
  return (
    <Badge tone="accent" className={className}>
      Sources disagree
    </Badge>
  );
}
