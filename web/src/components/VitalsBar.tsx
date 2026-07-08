import type { CounterSnapshot } from '../api/types';
import { CardButton } from './ui/Card';
import { CounterRange, Eyebrow, Mono } from './ui/Typography';

function formatCounterLabel(key: string) {
  return key.replaceAll('_', ' ');
}

/**
 * The persistent counters strip — the emotional centerpiece of the ledger.
 * Each entry is a tappable ledger line: label, range in ledger-red ink, and
 * the claim/source count that backs it.
 */
export function VitalsBar({
  counters,
  selectedKey,
  onSelectCounter,
}: {
  counters: CounterSnapshot[];
  selectedKey: string;
  onSelectCounter: (key: string) => void;
}) {
  if (counters.length === 0) {
    return (
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-muted">
        Counters unavailable — the API may be offline.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {counters.map((counter) => (
        <CardButton
          key={counter.counter_key}
          selected={selectedKey === counter.counter_key}
          onClick={() => onSelectCounter(counter.counter_key)}
          aria-haspopup="dialog"
        >
          <Eyebrow className="capitalize">
            {formatCounterLabel(counter.counter_key)}
          </Eyebrow>
          <CounterRange
            low={counter.low_value}
            high={counter.high_value}
            size="lg"
            className="mt-2"
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Mono>
              {counter.claim_count} {counter.claim_count === 1 ? 'claim' : 'claims'}
            </Mono>
            <Mono>
              {counter.primary_source_ids.length}{' '}
              {counter.primary_source_ids.length === 1 ? 'source' : 'sources'}
            </Mono>
            <Mono>As of {counter.as_of_date}</Mono>
          </div>
          <div className="mt-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted transition-colors group-hover:text-accent">
            View source claims →
          </div>
        </CardButton>
      ))}
    </div>
  );
}
