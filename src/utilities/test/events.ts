import { DEFAULT_OPTIONS } from '../../MutationsRegistry.js';
import type { ConfirmedEvent, Event, EventParams, OptimisticEvent, OptimisticEventWithParams } from '../../types/model';

export function toEventsWithoutUUID(events: Event[]) {
  // we only destructure to remove the uuid field, it's okay that it's unused
  // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
  return events.map(({ uuid, ...rest }) => rest);
}

export function toOptimisticEventWithParams(
  id: string,
  event: Event,
  params: EventParams = {
    timeout: DEFAULT_OPTIONS.timeout,
  },
): OptimisticEventWithParams {
  return {
    ...event,
    uuid: id,
    confirmed: false,
    params,
  };
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
    rejected: false,
  }));
}
