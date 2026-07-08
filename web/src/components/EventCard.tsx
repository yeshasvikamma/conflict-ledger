import type { EventCategory } from '../../../shared/constants';
import { DisagreementBadge } from './DisagreementBadge';
import { Card } from './ui/Card';
import { Eyebrow, Heading, Mono } from './ui/Typography';

export type TimelineEventData = {
  id: string;
  title: string;
  location: string;
  eventDate: string;
  category: EventCategory;
  claimCount: number;
  hasDisagreement: boolean;
};

export function EventCard({ event }: { event: TimelineEventData }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <Eyebrow>{event.category.replaceAll('_', ' ')}</Eyebrow>
        {event.hasDisagreement && <DisagreementBadge />}
      </div>
      <Heading level="h3" className="mt-2">
        {event.title}
      </Heading>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Mono>{event.location}</Mono>
        <Mono>{event.eventDate}</Mono>
        <Mono>
          {event.claimCount} {event.claimCount === 1 ? 'claim' : 'claims'}
        </Mono>
      </div>
    </Card>
  );
}
