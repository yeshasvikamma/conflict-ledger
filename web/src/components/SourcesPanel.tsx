import type { SourceSummary } from '../api/types';
import { TierBadge } from './ui/Badge';
import { Card } from './ui/Card';
import { BodyText, Eyebrow, Heading, Mono } from './ui/Typography';

/**
 * The transparency register — every discovered outlet, its tier, and why.
 */
export function SourcesPanel({ sources }: { sources: SourceSummary[] }) {
  return (
    <section>
      <Eyebrow>Sources</Eyebrow>
      <Heading level="h1" className="mt-2">
        Transparency register
      </Heading>
      <BodyText muted className="mt-2 max-w-2xl">
        Every discovered outlet, its trust tier, and the reasoning behind it. Ratings
        are drawn from the cached reliability dataset when available; unrated sources
        stay visible and carry no fabricated score.
      </BodyText>

      {sources.length === 0 ? (
        <Card className="mt-6">
          <BodyText muted>No sources discovered yet.</BodyText>
        </Card>
      ) : (
        <Card padded={false} className="mt-6 overflow-hidden">
          <div className="hidden grid-cols-12 gap-4 border-b border-rule bg-paper-sunken px-5 py-3 md:grid">
            <Mono className="col-span-3">Source</Mono>
            <Mono className="col-span-2">Tier</Mono>
            <Mono className="col-span-4">Reason</Mono>
            <Mono className="col-span-3">Rating</Mono>
          </div>
          <ul className="divide-y divide-rule">
            {sources.map((source) => (
              <li
                key={source.domain}
                className="grid grid-cols-1 gap-3 px-5 py-5 md:grid-cols-12 md:items-start md:gap-4"
              >
                <div className="md:col-span-3">
                  <BodyText className="font-medium">{source.name}</BodyText>
                  <Mono className="mt-1">{source.domain}</Mono>
                </div>
                <div className="md:col-span-2">
                  <TierBadge tier={source.tier} />
                </div>
                <BodyText muted className="md:col-span-4">
                  {source.tier_reason}
                </BodyText>
                <div className="md:col-span-3">
                  {source.rating ? (
                    <div className="space-y-1">
                      <BodyText className="font-medium">
                        {source.rating.reliability}
                      </BodyText>
                      <BodyText muted>{source.rating.lean}</BodyText>
                      <a
                        href={source.rating.methodology_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-sm font-medium text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-accent hover:decoration-accent"
                      >
                        Methodology
                      </a>
                    </div>
                  ) : (
                    <Mono>Not yet rated</Mono>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
