import { EventCard, type TimelineEventData } from './EventCard';
import { Card } from './ui/Card';
import { BodyText, Eyebrow, Heading } from './ui/Typography';

/**
 * The event endpoint isn't built yet, so this always takes the empty-state
 * branch. EventCard/DisagreementBadge stay wired here so the timeline lights
 * up with zero redesign once events start flowing.
 */
export function Timeline() {
  const events: TimelineEventData[] = [];

  return (
    <section>
      <Eyebrow>Timeline</Eyebrow>
      <Heading level="h1" className="mt-2">
        Event timeline
      </Heading>
      <BodyText muted className="mt-2 max-w-2xl">
        A chronological record of extracted events, each resolving to its own claims and
        disagreements.
      </BodyText>

      {events.length === 0 ? (
        <Card className="mt-6">
          <BodyText muted>
            The event timeline isn't live yet — extraction and clustering for this view
            are still being built. Counters and sources above are already running on
            real data.
          </BodyText>
        </Card>
      ) : (
        <ol className="mt-6 space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <EventCard event={event} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
