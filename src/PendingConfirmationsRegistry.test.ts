import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';

import { mutationIDComparator } from './MutationsRegistry.js';
import PendingConfirmation from './PendingConfirmation.js';
import PendingConfirmationRegistry from './PendingConfirmationRegistry.js';
import type { Event } from './types/model.js';
import { toOptimisticEvents, toOptimisticEventWithParams, toConfirmedEvents } from './utilities/test/events.js';

vi.mock('./PendingConfirmation.js');

describe('PendingConfirmationRegistry', () => {
  const events: Event[] = [
    {
      mutationID: 'my-mutation-id-1',
      name: 'foo',
      data: { bar: 123 },
    },
    {
      mutationID: 'my-mutation-id-2',
      name: 'baz',
      data: { qux: 456 },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds pending confirmations', async () => {
    const registry = new PendingConfirmationRegistry(mutationIDComparator);
    await registry.add(events.map((elem) => toOptimisticEventWithParams(elem)));
    expect(registry['pendingConfirmations'].length).toBe(1);
  });

  it('confirms events and affects pending confirmations', async () => {
    const registry = new PendingConfirmationRegistry(mutationIDComparator);
    await registry.add(events.map((elem) => toOptimisticEventWithParams(elem)));
    await registry.confirmEvents(toConfirmedEvents(events));
    expect(registry['pendingConfirmations'][0].removeMatchingEvents).toHaveBeenCalled();
  });

  it('rejects events and removes finalized pending confirmations', async () => {
    const mockedIsDone = vi.fn();
    const mockPendingConfirmationInstance = {
      removeMatchingEvents: vi.fn().mockImplementation(async () => {
        mockedIsDone.mockReturnValue(true);
      }),
      isDone: mockedIsDone,
      finalise: vi.fn(),
    };
    (PendingConfirmation as Mock).mockImplementation(() => mockPendingConfirmationInstance);

    const registry = new PendingConfirmationRegistry(mutationIDComparator);
    await registry.add(events.map((elem) => toOptimisticEventWithParams(elem)));
    const err = new Error('rejected events');
    await registry.rejectEvents(err, toOptimisticEvents(events));

    expect(mockPendingConfirmationInstance.removeMatchingEvents).toHaveBeenCalled();
    expect(mockPendingConfirmationInstance.isDone()).toBe(true);
    expect(registry['pendingConfirmations'].length).toBe(0);
  });

  it('finalizes all pending confirmations without error', async () => {
    const registry = new PendingConfirmationRegistry(mutationIDComparator);
    await registry.add(events.map((elem) => toOptimisticEventWithParams(elem)));
    await registry.finalise();
    expect(registry['pendingConfirmations'][0].finalise).toHaveBeenCalled();
  });

  it('finalizes all pending confirmations with an error', async () => {
    const registry = new PendingConfirmationRegistry(mutationIDComparator);
    await registry.add(events.map((elem) => toOptimisticEventWithParams(elem)));
    const err = new Error('error finalizing');
    await registry.finalise(err);
    expect(registry['pendingConfirmations'][0].finalise).toHaveBeenCalledWith(err);
  });
});
