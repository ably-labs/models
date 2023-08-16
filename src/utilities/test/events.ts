import { defaultComparator, DEFAULT_OPTIONS } from '../../MutationsRegistry.js';
import type { ConfirmedEvent, Event, EventParams, OptimisticEvent, OptimisticEventWithParams } from '../../types/model';

export function toOptimisticEventsWithParams(
  events: Event[],
  params: EventParams = {
    timeout: DEFAULT_OPTIONS.timeout,
    comparator: defaultComparator,
  },
): OptimisticEventWithParams[] {
  return events.map((event) => ({
    ...event,
    confirmed: false,
    params,
  }));
}

export function toOptimisticEvents(events: Event[]): OptimisticEvent[] {
  return events.map((event) => ({
    ...event,
    confirmed: false,
  }));
}

export function toConfirmedEvents(events: Event[]): ConfirmedEvent[] {
  return events.map((event) => ({
    ...event,
    confirmed: true,
  }));
}
