import { it, describe, expect, vi } from 'vitest';

import MutationsRegistry, { defaultComparator, DEFAULT_OPTIONS } from './MutationsRegistry.js';
import type { Event } from './types/model.js';
import type { MutationMethods, MutationFunc, EventComparator } from './types/mutations.js';
import { toOptimisticEventsWithParams } from './utilities/test/events.js';

interface Methods extends MutationMethods {
  one: MutationFunc<[string], string>;
  two: MutationFunc<[number], { x: number }>;
}

interface MutationsTestContext {}

describe('MutationsRegistry', () => {
  it<MutationsTestContext>('invokes mutation methods', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry<Methods>({ onEvents, onError });
    mutations.register({
      one: async (x: string) => x,
      two: {
        func: async (x: number) => ({ x }),
        options: { timeout: 1000 },
      },
    });
    await expect(mutations.handler.one('foo')).resolves.toEqual('foo');
    await expect(mutations.handler.two(123)).resolves.toEqual({ x: 123 });
    expect(onEvents).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it<MutationsTestContext>('mutation method throws and calls onError', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry<Pick<Methods, 'one'>>({ onEvents, onError });
    mutations.register({
      one: async (x: string) => {
        throw x;
      },
    });

    await expect(mutations.handler.one('foo')).rejects.toEqual(new Error('foo'));
    expect(onEvents).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(1, new Error('foo'), []);
  });

  it<MutationsTestContext>('mutation method throws at same time as optimistic update fails', async () => {
    let onEvents = vi.fn(async () => [Promise.reject('optimistic update failed'), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry<Pick<Methods, 'one'>>({ onEvents, onError });
    mutations.register({
      one: async (x: string) => {
        throw x;
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    const expectedEvents = toOptimisticEventsWithParams(events, {
      timeout: DEFAULT_OPTIONS.timeout,
      comparator: defaultComparator,
    });
    await expect(mutations.handler.one.$expect(events)('foo')).rejects.toEqual(new Error('optimistic update failed'));
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, expectedEvents);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(1, new Error('optimistic update failed'), expectedEvents);
  });

  it<MutationsTestContext>('invokes mutation methods with expectations (default comparator) and options', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry<Methods>({ onEvents, onError });
    mutations.register({
      one: async (x: string) => x,
      two: {
        func: async (x: number) => ({ x }),
        options: { timeout: 1000 },
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    const result1 = await mutations.handler.one.$expect(events)('foo');
    expect(result1[0]).toEqual('foo');
    await expect(result1[1]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(
      1,
      toOptimisticEventsWithParams(events, { timeout: DEFAULT_OPTIONS.timeout, comparator: defaultComparator }),
    );
    expect(onError).not.toHaveBeenCalled();

    const result2 = await mutations.handler.two.$expect(events)(123);
    expect(result2[0]).toEqual({ x: 123 });
    await expect(result2[1]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      toOptimisticEventsWithParams(events, { timeout: 1000, comparator: defaultComparator }),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it<MutationsTestContext>('invokes mutation methods with expectations (custom comparator) and options', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry<Methods>({ onEvents, onError });
    mutations.register({
      one: async (x: string) => x,
      two: {
        func: async (x: number) => ({ x }),
        options: { timeout: 1000 },
      },
    });

    const nameOnlyComparator: EventComparator = (optimistic: Event, confirmed: Event) =>
      optimistic.name === confirmed.name;

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    const result1 = await mutations.handler.one.$expect(events, nameOnlyComparator)('foo');
    expect(result1[0]).toEqual('foo');
    await expect(result1[1]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(
      1,
      toOptimisticEventsWithParams(events, { timeout: DEFAULT_OPTIONS.timeout, comparator: nameOnlyComparator }),
    );
    expect(onError).not.toHaveBeenCalled();

    const result2 = await mutations.handler.two.$expect(events, nameOnlyComparator)(123);
    expect(result2[0]).toEqual({ x: 123 });
    await expect(result2[1]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      toOptimisticEventsWithParams(events, { timeout: 1000, comparator: nameOnlyComparator }),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it<MutationsTestContext>('mutation methods with expectations and options throw and call onError', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry<Methods>({ onEvents, onError });
    mutations.register({
      one: async (x: string) => {
        throw x;
      },
      two: {
        func: async (x: number) => {
          throw x;
        },
        options: { timeout: 1000 },
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    await expect(mutations.handler.one.$expect(events)('foo')).rejects.toEqual(new Error('foo'));
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(
      1,
      toOptimisticEventsWithParams(events, { timeout: DEFAULT_OPTIONS.timeout, comparator: defaultComparator }),
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(
      1,
      new Error('foo'),
      toOptimisticEventsWithParams(events, { timeout: DEFAULT_OPTIONS.timeout, comparator: defaultComparator }),
    );

    await expect(mutations.handler.two.$expect(events)(123)).rejects.toEqual(new Error('123'));
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      toOptimisticEventsWithParams(events, { timeout: 1000, comparator: defaultComparator }),
    );
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(
      2,
      new Error('123'),
      toOptimisticEventsWithParams(events, { timeout: 1000, comparator: defaultComparator }),
    );
  });

  it<MutationsTestContext>('apply updates fails', async () => {
    const expectedErr = new Error('optimistic update failed');
    let onEvents = vi.fn(async () => [Promise.reject(expectedErr), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry<Methods>({ onEvents, onError });
    mutations.register({
      one: async (x: string) => x,
      two: {
        func: async (x: number) => ({ x }),
        options: { timeout: 1000 },
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    await expect(mutations.handler.one.$expect(events)('foo')).rejects.toThrow(expectedErr);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(
      1,
      toOptimisticEventsWithParams(events, { timeout: DEFAULT_OPTIONS.timeout, comparator: defaultComparator }),
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(
      1,
      expectedErr,
      toOptimisticEventsWithParams(events, { timeout: DEFAULT_OPTIONS.timeout, comparator: defaultComparator }),
    );

    await expect(mutations.handler.two.$expect(events)(123)).rejects.toThrow(expectedErr);
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      toOptimisticEventsWithParams(events, { timeout: 1000, comparator: defaultComparator }),
    );
    expect(onError).toHaveBeenNthCalledWith(
      2,
      expectedErr,
      toOptimisticEventsWithParams(events, { timeout: 1000, comparator: defaultComparator }),
    );
  });

  it<MutationsTestContext>('methods not confirmed', async () => {
    const expectedErr = new Error('optimistic update failed');
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.reject(expectedErr)]);
    let onError = vi.fn(async () => {});
    const mutations = new MutationsRegistry<Methods>({ onEvents, onError });
    mutations.register({
      one: async (x: string) => x,
      two: {
        func: async (x: number) => ({ x }),
        options: { timeout: 1000 },
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    const result1 = await mutations.handler.one.$expect(events)('foo');
    expect(result1[0]).toEqual('foo');
    await expect(result1[1]).rejects.toThrow(expectedErr);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(
      1,
      toOptimisticEventsWithParams(events, { timeout: DEFAULT_OPTIONS.timeout, comparator: defaultComparator }),
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(
      1,
      expectedErr,
      toOptimisticEventsWithParams(events, { timeout: DEFAULT_OPTIONS.timeout, comparator: defaultComparator }),
    );

    const result2 = await mutations.handler.two.$expect(events)(123);
    expect(result2[0]).toEqual({ x: 123 });
    await expect(result2[1]).rejects.toThrow(expectedErr);
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      toOptimisticEventsWithParams(events, { timeout: 1000, comparator: defaultComparator }),
    );
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(
      2,
      expectedErr,
      toOptimisticEventsWithParams(events, { timeout: 1000, comparator: defaultComparator }),
    );
  });
});
