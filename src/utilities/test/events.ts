import type { Event, EventParams, OptimisticEventWithParams } from '../../types/model';

export function toExpectedEvents(events: Event[], params: EventParams): OptimisticEventWithParams[] {
  return events.map((event) => ({
    ...event,
    confirmed: false,
    params,
  }));
}
