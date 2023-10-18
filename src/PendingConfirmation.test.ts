import { describe, it, expect } from 'vitest';

import PendingConfirmation from './PendingConfirmation.js';
import type { Event, EventParams } from './types/model.js';
import { toOptimisticEventWithParams } from './utilities/test/events.js';

describe('PendingConfirmation', () => {
  const defaultTimeout = 3000;
  const mockComparator = (e1: Event, e2: Event) => e1.name === e2.name;
  const params: EventParams = { timeout: defaultTimeout };

  const events: Event[] = [
    { mutationId: 'id_1', name: 'foo', data: { bar: 123 } },
    { mutationId: 'id_2', name: 'baz', data: { qux: 456 } },
  ];

  const expectedEvents = events.map((elem) => toOptimisticEventWithParams(elem, params));

  it('initializes with the correct default values', () => {
    const pc = new PendingConfirmation(defaultTimeout, expectedEvents, mockComparator);
    expect(pc.isDone).toBe(false);
  });

  it('completes with an error when it times out', async () => {
    const pc = new PendingConfirmation(1, expectedEvents, mockComparator);
    await expect(pc.promise).rejects.toThrow('timed out waiting for event confirmation');
    expect(pc.isDone).toBe(true);
  });

  it('removes matching events and finalizes when no events are left', async () => {
    const pc = new PendingConfirmation(defaultTimeout, expectedEvents, mockComparator);
    await pc.removeMatchingEvents(events.map((elem) => toOptimisticEventWithParams(elem, params)));
    expect(pc.isDone).toBe(true);
  });

  it('does not finalize when there are remaining events after removal', async () => {
    const pc = new PendingConfirmation(defaultTimeout, expectedEvents, mockComparator);
    await pc.removeMatchingEvents(expectedEvents.filter((_, i) => i === 0));
    expect(pc.isDone).toBe(false);
  });
});
