import { DEFAULT_OPTIONS } from '../../MutationsRegistry.js';
import type { ConfirmedEvent, Event, EventParams, OptimisticEvent, OptimisticEventWithParams } from '../../types/model';

export function toEventsWithoutUUID(events: Event[]) {
  // we only destructure to remove the uuid field, it's okay that it's unused
  // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
  return events.map(({ mutationID: uuid, ...rest }) => rest);
}

export function toOptimisticEventWithParams(
  event: Omit<OptimisticEvent, 'confirmed'>,
  params: EventParams = {
    timeout: DEFAULT_OPTIONS.timeout,
  },
): OptimisticEventWithParams {
  return {
    ...event,
    params,
    ...{ confirmed: false },
  };
}

export function toOptimisticEvent(event: Event): OptimisticEvent {
  return {
    ...event,
    confirmed: false,
  };
}

export function toOptimisticEvents(events: Event[]): OptimisticEvent[] {
  return events.map((event) => toOptimisticEvent(event));
}

export function toConfirmedEvents(events: Event[]): ConfirmedEvent[] {
  return events.map((event, i) => ({
    ...{ sequenceID: `${i}` },
    ...event,
    confirmed: true,
    rejected: false,
  }));
}
