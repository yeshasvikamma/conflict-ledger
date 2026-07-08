import { useEffect, useMemo, useState } from 'react';
import {
  CounterBreakdown,
  CounterSnapshot,
  DisagreementEvent,
  SourceSummary,
  StoryCard,
  getCounterBreakdown,
  getCounters,
  getDisagreementEvent,
  getSources,
  getStoryCards,
} from './api/client';

type ViewKey = 'vitals' | 'sources' | 'disagreement';

const VIEW_LABELS: Record<ViewKey, string> = {
  vitals: 'Vitals',
  sources: 'Sources',
  disagreement: 'Disagreement',
};

function App() {
  const [activeView, setActiveView] = useState<ViewKey>('vitals');
  const [counters, setCounters] = useState<CounterSnapshot[]>([]);
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [stories, setStories] = useState<StoryCard[]>([]);
  const [disagreement, setDisagreement] = useState<DisagreementEvent | null>(null);
  const [selectedKey, setSelectedKey] = useState('journalists_killed');
  const [breakdown, setBreakdown] = useState<CounterBreakdown | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const [counterRows, sourceRows, storyRows, disagreementEvent] = await Promise.all(
        [getCounters(), getSources(), getStoryCards(), getDisagreementEvent()],
      );

      setCounters(counterRows);
      setSources(sourceRows);
      setStories(storyRows);
      setDisagreement(disagreementEvent);
      setSelectedKey(counterRows[0]?.counter_key ?? '');
    }

    load();
  }, []);

  useEffect(() => {
    if (!selectedKey) {
      setBreakdown(null);
      setBreakdownLoading(false);
      return;
    }

    let cancelled = false;
    setBreakdownLoading(true);

    getCounterBreakdown(selectedKey)
      .then((nextBreakdown) => {
        if (!cancelled) {
          setBreakdown(nextBreakdown);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBreakdownLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedKey]);

  const leadStory = stories[0] ?? null;
  const secondaryStories = stories.slice(1);

  return (
    <main className="min-h-screen bg-[#f7f4ed] text-neutral-950">
      <Header activeView={activeView} onViewChange={setActiveView} />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-5 py-8 sm:px-8 lg:px-10">
        {activeView === 'vitals' && (
          <VitalsView
            counters={counters}
            selectedKey={selectedKey}
            breakdown={breakdown}
            breakdownLoading={breakdownLoading}
            leadStory={leadStory}
            secondaryStories={secondaryStories}
            onSelectCounter={setSelectedKey}
          />
        )}
        {activeView === 'sources' && <SourcesView sources={sources} />}
        {activeView === 'disagreement' && disagreement && (
          <DisagreementView event={disagreement} />
        )}
      </div>
    </main>
  );
}

function Header({
  activeView,
  onViewChange,
}: {
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
}) {
  return (
    <header className="border-b border-neutral-950 bg-[#f7f4ed]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-5xl">
            <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
              Live Conflict Ledger
            </p>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.94] tracking-tight text-neutral-950 sm:text-6xl lg:text-7xl">
              Sourced claims, not a feed of rumors.
            </h1>
          </div>
          <div className="max-w-sm border-l border-neutral-950 pl-4 text-sm font-medium leading-6 text-neutral-800">
            Built for a live newsroom wall, strict enough to keep every number tied to a
            cited source.
          </div>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Primary">
          {(Object.keys(VIEW_LABELS) as ViewKey[]).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => onViewChange(view)}
              className={`border px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] transition ${
                activeView === view
                  ? 'border-neutral-950 bg-neutral-950 text-stone-50'
                  : 'border-neutral-950 bg-transparent text-neutral-950 hover:bg-white'
              }`}
            >
              {VIEW_LABELS[view]}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

function VitalsView({
  counters,
  selectedKey,
  breakdown,
  breakdownLoading,
  leadStory,
  secondaryStories,
  onSelectCounter,
}: {
  counters: CounterSnapshot[];
  selectedKey: string;
  breakdown: CounterBreakdown | null;
  breakdownLoading: boolean;
  leadStory: StoryCard | null;
  secondaryStories: StoryCard[];
  onSelectCounter: (key: string) => void;
}) {
  return (
    <section className="grid gap-8 xl:grid-cols-[minmax(0,1.02fr)_minmax(390px,0.98fr)]">
      <div className="space-y-6">
        {leadStory && (
          <LeadStoryCard
            story={leadStory}
            active={selectedKey === leadStory.counter_key}
            onSelect={() => onSelectCounter(leadStory.counter_key)}
          />
        )}
        <StoryGrid
          stories={secondaryStories}
          selectedKey={selectedKey}
          onSelectCounter={onSelectCounter}
        />
        <CounterStrip
          counters={counters}
          selectedKey={selectedKey}
          onSelectCounter={onSelectCounter}
        />
      </div>
      <CounterBreakdownPanel
        breakdown={breakdown}
        loading={breakdownLoading}
        selectedKey={selectedKey}
      />
    </section>
  );
}

function LeadStoryCard({
  story,
  active,
  onSelect,
}: {
  story: StoryCard;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group block w-full overflow-hidden border-2 bg-white text-left transition ${
        active ? 'border-orange-700' : 'border-neutral-950 hover:border-orange-700'
      }`}
    >
      <MediaPanel story={story} prominent />
      <div className="p-5 sm:p-7">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <TierBadge tier={story.tier} />
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-neutral-600">
            {story.source}
          </span>
        </div>
        <h2 className="max-w-3xl text-4xl font-black leading-[0.96] tracking-tight text-neutral-950 sm:text-5xl">
          {story.headline}
        </h2>
        <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-neutral-700">
          {story.dek}
        </p>
        <div className="mt-5 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">
          Open source trail
        </div>
      </div>
    </button>
  );
}

function StoryGrid({
  stories,
  selectedKey,
  onSelectCounter,
}: {
  stories: StoryCard[];
  selectedKey: string;
  onSelectCounter: (key: string) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {stories.map((story) => (
        <button
          key={story.id}
          type="button"
          onClick={() => onSelectCounter(story.counter_key)}
          className={`group overflow-hidden border bg-white text-left transition ${
            selectedKey === story.counter_key
              ? 'border-orange-700'
              : 'border-neutral-950 hover:border-orange-700'
          }`}
        >
          <MediaPanel story={story} />
          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <TierBadge tier={story.tier} compact />
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-600">
                {story.source}
              </span>
            </div>
            <h3 className="text-2xl font-black leading-tight tracking-tight text-neutral-950">
              {story.headline}
            </h3>
            <p className="mt-3 text-sm font-medium leading-6 text-neutral-700">
              {story.dek}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

function MediaPanel({
  story,
  prominent = false,
}: {
  story: StoryCard;
  prominent?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden border-b border-neutral-950 bg-neutral-950 ${
        prominent ? 'min-h-[320px]' : 'min-h-[190px]'
      }`}
    >
      <div className="absolute inset-0 opacity-90 [background-image:linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,.1)_1px,transparent_1px)] [background-size:34px_34px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_28%,rgba(194,65,12,.9)_0,rgba(194,65,12,.9)_10%,transparent_11%),radial-gradient(circle_at_30%_68%,rgba(250,250,249,.18)_0,rgba(250,250,249,.18)_15%,transparent_16%)]" />
      <div className="absolute left-4 top-4 bg-orange-700 px-3 py-1 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-white">
        {story.image_label}
      </div>
      <div className="absolute bottom-4 left-4 right-4 max-w-xl text-xs font-medium leading-5 text-stone-100">
        {story.image_credit}
      </div>
    </div>
  );
}

function CounterStrip({
  counters,
  selectedKey,
  onSelectCounter,
}: {
  counters: CounterSnapshot[];
  selectedKey: string;
  onSelectCounter: (key: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {counters.map((counter) => (
        <CounterButton
          key={counter.counter_key}
          counter={counter}
          selected={selectedKey === counter.counter_key}
          onClick={() => onSelectCounter(counter.counter_key)}
        />
      ))}
    </div>
  );
}

function CounterButton({
  counter,
  selected,
  onClick,
}: {
  counter: CounterSnapshot;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group border bg-white p-4 text-left transition ${
        selected ? 'border-orange-700' : 'border-neutral-950 hover:border-orange-700'
      }`}
    >
      <div className="font-mono text-3xl font-black tabular-nums text-neutral-950">
        <Ticker low={counter.low_value} high={counter.high_value} />
      </div>
      <div className="mt-2 text-sm font-black uppercase leading-5 tracking-tight text-neutral-950">
        {formatCounterKey(counter.counter_key)}
      </div>
      <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-600">
        {counter.claim_count} claims / {counter.primary_source_ids.length} sources
      </div>
      <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-600">
        As of {counter.as_of_date}
      </div>
      <div className="mt-4 text-sm font-semibold text-neutral-700 underline decoration-stone-400 underline-offset-4 group-hover:decoration-orange-700">
        View source claims
      </div>
    </button>
  );
}

function Ticker({ low, high }: { low: number; high: number }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 600;
    const start = window.performance.now();
    let frame = 0;

    function step(now: number) {
      setProgress(Math.min(1, (now - start) / duration));
      if (now - start < duration) {
        frame = window.requestAnimationFrame(step);
      }
    }

    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [low, high]);

  const currentLow = Math.round(low * progress);
  const currentHigh = Math.round(high * progress);

  if (low === high) return <span>{currentHigh.toLocaleString()}</span>;
  return (
    <span>
      {currentLow.toLocaleString()}–{currentHigh.toLocaleString()}
    </span>
  );
}

function CounterBreakdownPanel({
  breakdown,
  loading,
  selectedKey,
}: {
  breakdown: CounterBreakdown | null;
  loading: boolean;
  selectedKey: string;
}) {
  if (loading) {
    return (
      <aside className="border border-neutral-950 bg-white p-6 text-neutral-700">
        Loading source claims...
      </aside>
    );
  }

  if (!breakdown || breakdown.claims.length === 0) {
    return (
      <aside className="border border-neutral-950 bg-white p-6 text-neutral-700">
        No source claims available for {formatCounterKey(selectedKey)} yet.
      </aside>
    );
  }

  return (
    <aside className="border border-neutral-950 bg-white">
      <div className="border-b border-neutral-950 p-5">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">
          Drill-down
        </p>
        <h2 className="mt-2 text-3xl font-black leading-tight tracking-tight text-neutral-950">
          {formatCounterKey(breakdown.counter)}
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-neutral-700">
          Every displayed number resolves to exact quoted evidence and a source tier.
        </p>
      </div>
      <div className="divide-y divide-neutral-950">
        {breakdown.claims.map((claim) => (
          <article key={`${claim.url}-${claim.raw_quote}`} className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <TierBadge tier={claim.source.tier} />
              <span className="text-sm font-medium text-neutral-700">
                {claim.source.name} / {claim.source.tier} / {claim.source.domain}
              </span>
            </div>
            <blockquote className="border-l-4 border-orange-700 pl-4 text-lg font-black leading-7 text-neutral-950">
              "{claim.raw_quote}"
            </blockquote>
            <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-600">
              {claim.date}
            </div>
            <a
              className="mt-4 inline-flex break-all text-sm font-semibold text-neutral-800 underline decoration-stone-400 underline-offset-4 hover:decoration-orange-700"
              href={claim.url}
              target="_blank"
              rel="noreferrer"
            >
              {claim.url}
            </a>
          </article>
        ))}
      </div>
    </aside>
  );
}

function SourcesView({ sources }: { sources: SourceSummary[] }) {
  return (
    <section>
      <SectionLabel
        eyebrow="Sources"
        title="Transparency table for discovered outlets."
        copy="Ratings are drawn from the cached reliability dataset when available. Unrated sources stay visible but carry no fabricated score."
      />
      <div className="mt-6 overflow-hidden border border-neutral-950 bg-white">
        <div className="hidden grid-cols-12 border-b border-neutral-950 px-5 py-3 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-neutral-600 md:grid">
          <div className="col-span-4">Source</div>
          <div className="col-span-3">Tier</div>
          <div className="col-span-3">Reason</div>
          <div className="col-span-2">Rating</div>
        </div>
        <div className="divide-y divide-neutral-950">
          {sources.map((source) => (
            <article
              key={source.domain}
              className="grid grid-cols-1 gap-4 px-5 py-5 md:grid-cols-12 md:items-center"
            >
              <div className="md:col-span-4">
                <div className="text-xl font-black text-neutral-950">{source.name}</div>
                <div className="mt-1 font-mono text-sm text-neutral-600">
                  {source.domain}
                </div>
              </div>
              <div className="md:col-span-3">
                <TierBadge tier={source.tier} />
              </div>
              <div className="text-sm font-medium leading-6 text-neutral-700 md:col-span-3">
                {source.tier_reason}
              </div>
              <div className="text-sm font-medium text-neutral-700 md:col-span-2">
                {source.rating ? (
                  <div className="space-y-1">
                    <div className="font-black text-neutral-950">
                      {source.rating.reliability}
                    </div>
                    <div>{source.rating.lean}</div>
                    <a
                      href={source.rating.methodology_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex underline decoration-stone-400 underline-offset-4 hover:decoration-orange-700"
                    >
                      Methodology
                    </a>
                  </div>
                ) : (
                  <span className="text-neutral-500">No cached rating</span>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function DisagreementView({ event }: { event: DisagreementEvent }) {
  const range = useMemo(() => {
    const counts = event.claims.map((claim) => claim.value.count);
    return `${Math.min(...counts)}-${Math.max(...counts)}`;
  }, [event.claims]);

  return (
    <section>
      <SectionLabel
        eyebrow="Divergence View"
        title="When countable sources disagree, the ledger shows both."
        copy="The system does not average, overwrite, or quietly pick one claim. Disagreement is represented as a first-class state."
      />
      <div className="mt-6 border border-neutral-950 bg-white">
        <div className="border-b border-neutral-950 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 bg-orange-700 px-3 py-1 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-white">
                Disagreement
              </div>
              <h2 className="max-w-2xl text-4xl font-black leading-tight tracking-tight text-neutral-950">
                {event.title}
              </h2>
              <p className="mt-2 font-mono text-sm uppercase tracking-[0.1em] text-neutral-700">
                {event.location} / {event.event_date}
              </p>
            </div>
            <div className="font-mono text-6xl font-black tabular-nums text-neutral-950">
              {range}
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm font-medium leading-6 text-neutral-700">
            {event.disagreement_note}
          </p>
        </div>
        <div className="grid gap-0 md:grid-cols-2">
          {event.claims.map((claim) => (
            <article
              key={`${claim.source.domain}-${claim.value.count}`}
              className="border-t border-neutral-950 p-6 md:border-t-0 md:border-r md:last:border-r-0"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <TierBadge tier={claim.source.tier} />
                  <div className="mt-3 text-sm font-medium text-neutral-700">
                    {claim.source.name} / {claim.source.domain}
                  </div>
                </div>
                <div className="font-mono text-5xl font-black tabular-nums text-neutral-950">
                  {claim.value.count}
                </div>
              </div>
              <blockquote className="mt-6 border-l-4 border-orange-700 pl-4 text-lg font-black leading-7 text-neutral-950">
                "{claim.raw_quote}"
              </blockquote>
              <a
                href={claim.url}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex text-sm font-semibold text-neutral-800 underline decoration-stone-400 underline-offset-4 hover:decoration-orange-700"
              >
                View source claim
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionLabel({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy?: string;
}) {
  return (
    <div className="max-w-4xl">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-4xl font-black leading-tight tracking-tight text-neutral-950 sm:text-5xl">
        {title}
      </h2>
      {copy && (
        <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-neutral-700">
          {copy}
        </p>
      )}
    </div>
  );
}

function TierBadge({
  tier,
  compact = false,
}: {
  tier: string | null;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 border border-neutral-950 bg-[#f7f4ed] font-mono text-xs font-semibold uppercase tracking-[0.12em] text-neutral-950 ${
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1'
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-orange-700" />
      {tier ?? 'unrated'}
    </span>
  );
}

function formatCounterKey(key: string) {
  return key.replaceAll('_', ' ');
}

export default App;
