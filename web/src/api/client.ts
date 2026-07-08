import {
  getCounterBreakdown as getMockCounterBreakdown,
  getCounters as getMockCounters,
  getDisagreementEvent as getMockDisagreementEvent,
  getSources as getMockSources,
  getStoryCards as getMockStoryCards,
} from './mockClient';
import {
  getCounterBreakdown as getRealCounterBreakdown,
  getCounters as getRealCounters,
  getSources as getRealSources,
} from './realClient';

export type {
  CounterBreakdown,
  CounterSnapshot,
  DisagreementEvent,
  SourceSummary,
  StoryCard,
} from './types';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export async function getCounters() {
  return USE_MOCK ? getMockCounters() : getRealCounters();
}

export async function getCounterBreakdown(key: string) {
  return USE_MOCK ? getMockCounterBreakdown(key) : getRealCounterBreakdown(key);
}

export async function getSources() {
  return USE_MOCK ? getMockSources() : getRealSources();
}

// These rely on Tier B routes that are currently backend stubs.
export async function getStoryCards() {
  return getMockStoryCards();
}

export async function getDisagreementEvent() {
  return getMockDisagreementEvent();
}
