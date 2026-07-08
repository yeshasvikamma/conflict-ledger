export type CounterSnapshot = {
  counter_key: string;
  low_value: number;
  high_value: number;
  as_of_date: string;
  primary_source_ids: string[];
  claim_count: number;
};

export type CounterBreakdownClaim = {
  value: Record<string, unknown>;
  raw_quote: string;
  source: {
    name: string;
    tier: string;
    domain: string;
  };
  url: string;
  date: string;
};

export type CounterBreakdown = {
  counter: string;
  claims: CounterBreakdownClaim[];
};

export type SourceRating = {
  reliability: string;
  lean: string;
  methodology_url: string;
};

export type SourceSummary = {
  domain: string;
  name: string;
  tier: string;
  tier_reason: string;
  rating: SourceRating | null;
};

export type DisagreementClaim = {
  claim_type: string;
  origin_type: string;
  value: {
    count: number;
    group?: string;
    subtype?: string;
  };
  raw_quote: string;
  source: {
    name: string;
    tier: string;
    domain: string;
  };
  url: string;
  date: string;
};

export type DisagreementEvent = {
  id: string;
  title: string;
  location: string;
  event_date: string;
  has_disagreement: true;
  disagreement_note: string;
  claims: DisagreementClaim[];
};

export type StoryCard = {
  id: string;
  counter_key: string;
  headline: string;
  dek: string;
  source: string;
  tier: string;
  image_credit: string;
  image_label: string;
};
