import type { CounterBreakdown } from '../api/types';
import { TierBadge } from './ui/Badge';
import { Modal } from './ui/Modal';
import { BodyText, Eyebrow, Heading, Mono } from './ui/Typography';

function formatCounterLabel(key: string) {
  return key.replaceAll('_', ' ');
}

/**
 * The "every number is provably real" moment — each claim behind a counter,
 * shown as a numbered evidence entry with its exact quote and source.
 */
export function CounterBreakdownModal({
  open,
  onClose,
  counterKey,
  breakdown,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  counterKey: string;
  breakdown: CounterBreakdown | null;
  loading: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="breakdown-modal-title">
      <div className="flex items-start justify-between gap-4 border-b border-rule p-5 sm:p-6">
        <div>
          <Eyebrow>Drill-down</Eyebrow>
          <Heading
            level="h1"
            as="h2"
            id="breakdown-modal-title"
            className="mt-2 capitalize"
          >
            {formatCounterLabel(counterKey)}
          </Heading>
          <BodyText muted className="mt-2 max-w-md">
            Every claim behind this number, with its exact quote and source.
          </BodyText>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 border border-rule px-2.5 py-1.5 font-mono text-xs text-ink-muted transition-colors hover:border-rule-strong hover:text-ink"
        >
          Close
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto">
        {loading && (
          <BodyText muted className="p-6">
            Loading source claims…
          </BodyText>
        )}

        {!loading && (!breakdown || breakdown.claims.length === 0) && (
          <BodyText muted className="p-6">
            No source claims available for {formatCounterLabel(counterKey)} yet.
          </BodyText>
        )}

        {!loading && breakdown && breakdown.claims.length > 0 && (
          <ol className="divide-y divide-rule">
            {breakdown.claims.map((claim, index) => (
              <li key={`${claim.url}-${claim.raw_quote}`} className="p-5 sm:p-6">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Mono>No. {index + 1}</Mono>
                  <TierBadge tier={claim.source.tier} />
                  <BodyText>
                    {claim.source.name} · {claim.source.domain}
                  </BodyText>
                </div>
                <blockquote className="border-l-2 border-accent pl-4 font-display text-lg italic leading-7 text-ink">
                  “{claim.raw_quote}”
                </blockquote>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Mono>{claim.date}</Mono>
                  <a
                    href={claim.url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-sm font-medium text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-accent hover:decoration-accent"
                  >
                    {claim.url}
                  </a>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  );
}
