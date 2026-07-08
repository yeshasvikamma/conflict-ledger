import { CLAIM_TYPES, DISCOVERY_TIER, ORIGIN_TYPE } from '../../../shared/constants';
import type {
  CounterBreakdown,
  CounterSnapshot,
  DisagreementEvent,
  SourceSummary,
  StoryCard,
} from './types';

const [, WIRE_SERVICE_TIER, ESTABLISHED_TIER, EMERGING_UNVERIFIED_TIER] =
  DISCOVERY_TIER;
const [SEARCH_DISCOVERED_ORIGIN] = ORIGIN_TYPE;
const [, CASUALTY_COUNT_CLAIM] = CLAIM_TYPES;

const counters: CounterSnapshot[] = [
  {
    counter_key: 'journalists_killed',
    low_value: 3,
    high_value: 3,
    as_of_date: '2024-05-01',
    primary_source_ids: ['seed-reuters', 'seed-aljazeera'],
    claim_count: 2,
  },
  {
    counter_key: 'palestinians_killed',
    low_value: 15,
    high_value: 20,
    as_of_date: '2024-05-01',
    primary_source_ids: ['seed-reuters', 'seed-aljazeera'],
    claim_count: 2,
  },
  {
    counter_key: 'children_killed',
    low_value: 6,
    high_value: 8,
    as_of_date: '2024-05-01',
    primary_source_ids: ['seed-reuters'],
    claim_count: 1,
  },
];

const breakdowns: Record<string, CounterBreakdown> = {
  journalists_killed: {
    counter: 'journalists_killed',
    claims: [
      {
        value: { count: 3, names: [] },
        raw_quote:
          'The organization said at least 3 journalists have been killed in the enclave over the past week.',
        source: {
          name: 'Reuters',
          tier: WIRE_SERVICE_TIER,
          domain: 'reuters.com',
        },
        url: 'https://reuters.com/world/seed-journalist-1',
        date: '2024-05-01',
      },
      {
        value: { count: 3, names: [] },
        raw_quote:
          'Rights groups say 3 journalists have been killed in recent days across the territory.',
        source: {
          name: 'Al Jazeera',
          tier: ESTABLISHED_TIER,
          domain: 'aljazeera.com',
        },
        url: 'https://aljazeera.com/news/seed-journalist-2',
        date: '2024-05-01',
      },
    ],
  },
  palestinians_killed: {
    counter: 'palestinians_killed',
    claims: [
      {
        value: {
          count: 15,
          group: 'palestinian',
          subtype: 'total',
        },
        raw_quote:
          'Medical officials in Rafah said on Wednesday that 15 people were killed in a series of strikes on the southern city.',
        source: {
          name: 'Reuters',
          tier: WIRE_SERVICE_TIER,
          domain: 'reuters.com',
        },
        url: 'https://reuters.com/world/seed-casualty-a',
        date: '2024-05-01',
      },
      {
        value: {
          count: 20,
          group: 'palestinian',
          subtype: 'total',
        },
        raw_quote:
          'The health ministry said 20 people were killed in Rafah on Wednesday, a higher toll than earlier estimates.',
        source: {
          name: 'Al Jazeera',
          tier: ESTABLISHED_TIER,
          domain: 'aljazeera.com',
        },
        url: 'https://aljazeera.com/news/seed-casualty-b',
        date: '2024-05-01',
      },
    ],
  },
  children_killed: {
    counter: 'children_killed',
    claims: [
      {
        value: {
          count: 6,
          group: 'palestinian',
          subtype: 'child',
        },
        raw_quote:
          'Hospital officials reported that children were among those killed as families arrived through the day.',
        source: {
          name: 'Reuters',
          tier: WIRE_SERVICE_TIER,
          domain: 'reuters.com',
        },
        url: 'https://reuters.com/world/seed-casualty-a',
        date: '2024-05-01',
      },
    ],
  },
};

const sources: SourceSummary[] = [
  {
    domain: 'reuters.com',
    name: 'Reuters',
    tier: WIRE_SERVICE_TIER,
    tier_reason: 'Known international wire agency (category fact).',
    rating: {
      reliability: 'Very High',
      lean: 'Least Biased',
      methodology_url: 'https://mediabiasfactcheck.com/methodology/',
    },
  },
  {
    domain: 'aljazeera.com',
    name: 'Al Jazeera',
    tier: ESTABLISHED_TIER,
    tier_reason: 'Present in reliability dataset (established outlet).',
    rating: {
      reliability: 'Mostly Factual',
      lean: 'Left-Center',
      methodology_url: 'https://mediabiasfactcheck.com/methodology/',
    },
  },
  {
    domain: 'randomblog-example.net',
    name: 'Random Blog Example',
    tier: EMERGING_UNVERIFIED_TIER,
    tier_reason: 'Not found in reliability dataset.',
    rating: null,
  },
];

const storyCards: StoryCard[] = [
  {
    id: 'story-journalists',
    counter_key: 'journalists_killed',
    headline: 'Press freedom groups count three journalists killed in recent days.',
    dek: 'Two countable outlets carry the same figure, with each number traceable to a quote.',
    source: 'Reuters + Al Jazeera',
    tier: WIRE_SERVICE_TIER,
    image_credit:
      'Image treatment: muted map texture placeholder; replace only with licensed wire photo and visible agency credit.',
    image_label: 'Rafah / reporting risk',
  },
  {
    id: 'story-casualties',
    counter_key: 'palestinians_killed',
    headline: 'Rafah casualty reports diverge: 15 in one account, 20 in another.',
    dek: 'The ledger preserves the range instead of flattening it into a single number.',
    source: 'Reuters / Al Jazeera',
    tier: ESTABLISHED_TIER,
    image_credit:
      'Image treatment: muted map texture placeholder; replace only with licensed wire photo and visible agency credit.',
    image_label: 'Southern Gaza / conflicting counts',
  },
  {
    id: 'story-unverified',
    counter_key: 'children_killed',
    headline:
      'Unverified chatter remains visible to editors but excluded from counters.',
    dek: 'Signal and emerging sources stay separated from countable claims by construction.',
    source: 'Random Blog Example excluded',
    tier: EMERGING_UNVERIFIED_TIER,
    image_credit:
      'Image treatment: muted map texture placeholder; replace only with licensed wire photo and visible agency credit.',
    image_label: 'Verification boundary',
  },
];

const disagreement: DisagreementEvent = {
  id: 'event-rafah-casualty-range',
  title: 'Conflicting casualty count after Rafah strikes',
  location: 'Rafah',
  event_date: '2024-05-01',
  has_disagreement: true,
  disagreement_note:
    'Two countable sources describe the same date and location but report different casualty counts. Both claims remain visible.',
  claims: [
    {
      claim_type: CASUALTY_COUNT_CLAIM,
      origin_type: SEARCH_DISCOVERED_ORIGIN,
      value: {
        count: 15,
        group: 'palestinian',
        subtype: 'total',
      },
      raw_quote:
        'Medical officials in Rafah said on Wednesday that 15 people were killed in a series of strikes on the southern city.',
      source: {
        name: 'Reuters',
        tier: WIRE_SERVICE_TIER,
        domain: 'reuters.com',
      },
      url: 'https://reuters.com/world/seed-casualty-a',
      date: '2024-05-01',
    },
    {
      claim_type: CASUALTY_COUNT_CLAIM,
      origin_type: SEARCH_DISCOVERED_ORIGIN,
      value: {
        count: 20,
        group: 'palestinian',
        subtype: 'total',
      },
      raw_quote:
        'The health ministry said 20 people were killed in Rafah on Wednesday, a higher toll than earlier estimates.',
      source: {
        name: 'Al Jazeera',
        tier: ESTABLISHED_TIER,
        domain: 'aljazeera.com',
      },
      url: 'https://aljazeera.com/news/seed-casualty-b',
      date: '2024-05-01',
    },
  ],
};

export async function getCounters(): Promise<CounterSnapshot[]> {
  return counters;
}

export async function getCounterBreakdown(
  key: string,
): Promise<CounterBreakdown | null> {
  return breakdowns[key] ?? null;
}

export async function getSources(): Promise<SourceSummary[]> {
  return sources;
}

export async function getStoryCards(): Promise<StoryCard[]> {
  return storyCards;
}

export async function getDisagreementEvent(): Promise<DisagreementEvent> {
  return disagreement;
}
