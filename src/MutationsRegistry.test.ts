import { it, describe, expect, vi } from 'vitest';

import MutationsRegistry, { DEFAULT_OPTIONS } from './MutationsRegistry.js';
import type { Event } from './types/model.js';
import { addCustomMatchers } from './utilities/test/custom-matchers.js';
import { toOptimisticEventsWithParams } from './utilities/test/events.js';

interface MutationsTestContext {}

describe('MutationsRegistry', () => {
  addCustomMatchers(expect);

  it<MutationsTestContext>('handleOptimsitic with default comparator and custom timeout for a single call', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();

    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const events: Event[] = [{ name: 'foo', data: { bar: 123 } }];
    await mutations.handleOptimsitic({ events });
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(
      1,
      expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events, { timeout: DEFAULT_OPTIONS.timeout })),
    );
    expect(onError).not.toHaveBeenCalled();

    await mutations.handleOptimsitic({ events, options: { timeout: 1000 } });
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events, { timeout: 1000 })),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it<MutationsTestContext>('handleOptimsitic where update rejects', async () => {
    const expectedErr = new Error('optimistic update failed');
    let onEvents = vi.fn(async () => [Promise.reject(expectedErr), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const events: Event[] = [{ name: 'foo', data: { bar: 123 } }];
    await expect(mutations.handleOptimsitic({ events })).rejects.toThrow(expectedErr);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(
      1,
      expectedErr,
      expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)),
    );

    await expect(mutations.handleOptimsitic({ events })).rejects.toThrow(expectedErr);
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(2, expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)));
    expect(onError).toHaveBeenNthCalledWith(
      2,
      expectedErr,
      expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)),
    );
  });

  it<MutationsTestContext>('handleOptimistic where confirmation promise rejects', async () => {
    const expectedErr = new Error('optimistic update failed');
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.reject(expectedErr)]);
    let onError = vi.fn(async () => {});
    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const events: Event[] = [{ name: 'foo', data: { bar: 123 } }];
    await mutations.handleOptimsitic({ events });
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(
      1,
      expectedErr,
      expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)),
    );

    await mutations.handleOptimsitic({ events });
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(2, expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)));
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(
      2,
      expectedErr,
      expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)),
    );
  });

  it<MutationsTestContext>('handleOptimistic where confirmation promise rejects and is unhandled', async () => {
    const expectedErr = new Error('optimistic update failed');
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.reject(expectedErr)]);
    let onError = vi.fn(async () => {});
    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const events: Event[] = [{ name: 'foo', data: { bar: 123 } }];
    await mutations.handleOptimsitic({ events });
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(
      1,
      expectedErr,
      expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)),
    );

    // do not handle the returned promise
    await mutations.handleOptimsitic({ events });
  });

  it<MutationsTestContext>('handleOptimistic with empty events', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn(async () => {});
    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const [conf1] = await mutations.handleOptimsitic({ events: [] });
    await expect(conf1).resolves.toBeUndefined();
    expect(onEvents).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    const [conf2] = await mutations.handleOptimsitic({ events: [] });
    await expect(conf2).resolves.toBeUndefined();
  });

  it<MutationsTestContext>('handleOptimistic with a bound mutation function', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();

    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const events: Event[] = [{ name: 'foo', data: { bar: 123 } }];
    const [conf1] = await mutations.handleOptimsitic({ events });
    await expect(conf1).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(
      1,
      expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events, DEFAULT_OPTIONS)),
    );
    expect(onError).not.toHaveBeenCalled();

    const [conf2] = await mutations.handleOptimsitic({ events });
    await expect(conf2).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events, DEFAULT_OPTIONS)),
    );
    expect(onError).not.toHaveBeenCalled();
  });
});
