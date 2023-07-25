import { it, describe, expect, vi } from 'vitest';
import MutationsRegistry, {
  MutationMethods,
  MutationFunc,
  defaultComparator,
  DEFAULT_OPTIONS,
} from './MutationsRegistry.js';
import type { Event, EventParams, OptimisticEventWithParams } from './Model.js';

interface Methods extends MutationMethods {
  one: MutationFunc<[string], string>;
  two: MutationFunc<[number], { x: number }>;
}

interface MutationsTestContext {}

function toExpectedEvents(events: Event[], params: EventParams): OptimisticEventWithParams[] {
  return events.map((event) => ({
    ...event,
    confirmed: false,
    params,
  }));
}

describe('MutationsRegistry', () => {
  it<MutationsTestContext>('invokes mutation methods', async () => {
    let onEvents = vi.fn(() => [Promise.resolve(), Promise.resolve()]);
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
    let onEvents = vi.fn(() => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry<Pick<Methods, 'one'>>({ onEvents, onError });
    mutations.register({
      one: async (x: string) => {
        throw x;
      },
    });

    await expect(mutations.handler.one('foo')).rejects.toEqual('foo');
    expect(onEvents).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(1, 'foo', []);
  });

  it<MutationsTestContext>('invokes mutation methods with expectations and options', async () => {
    let onEvents = vi.fn(() => [Promise.resolve(), Promise.resolve()]);
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
    await expect(result1[2]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(
      1,
      toExpectedEvents(events, { timeout: DEFAULT_OPTIONS.timeout, comparator: defaultComparator }),
    );
    expect(onError).not.toHaveBeenCalled();

    const result2 = await mutations.handler.two.$expect(events)(123);
    expect(result2[0]).toEqual({ x: 123 });
    await expect(result2[1]).resolves.toBeUndefined();
    await expect(result2[2]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      toExpectedEvents(events, { timeout: 1000, comparator: defaultComparator }),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it<MutationsTestContext>('mutation methods with expectations and options throw and call onError', async () => {
    let onEvents = vi.fn(() => [Promise.resolve(), Promise.resolve()]);
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
    await expect(mutations.handler.one.$expect(events)('foo')).rejects.toEqual('foo');
    expect(onEvents).toHaveBeenCalledTimes(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(
      1,
      'foo',
      toExpectedEvents(events, { timeout: DEFAULT_OPTIONS.timeout, comparator: defaultComparator }),
    );

    await expect(mutations.handler.two.$expect(events)(123)).rejects.toEqual(123);
    expect(onEvents).toHaveBeenCalledTimes(0);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(
      2,
      123,
      toExpectedEvents(events, { timeout: 1000, comparator: defaultComparator }),
    );
  });

  it<MutationsTestContext>('apply updates fails', async () => {
    let onEvents = vi.fn(() => [Promise.reject(), Promise.resolve()]);
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
    await expect(result1[1]).rejects.toBeUndefined();
    await expect(result1[2]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(
      1,
      toExpectedEvents(events, { timeout: DEFAULT_OPTIONS.timeout, comparator: defaultComparator }),
    );
    expect(onError).not.toHaveBeenCalled();

    const result2 = await mutations.handler.two.$expect(events)(123);
    expect(result2[0]).toEqual({ x: 123 });
    await expect(result2[1]).rejects.toBeUndefined();
    await expect(result2[2]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      toExpectedEvents(events, { timeout: 1000, comparator: defaultComparator }),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it<MutationsTestContext>('methods not confirmed', async () => {
    let onEvents = vi.fn(() => [Promise.resolve(), Promise.reject()]);
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
    await expect(result1[2]).rejects.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(
      1,
      toExpectedEvents(events, { timeout: DEFAULT_OPTIONS.timeout, comparator: defaultComparator }),
    );
    expect(onError).not.toHaveBeenCalled();

    const result2 = await mutations.handler.two.$expect(events)(123);
    expect(result2[0]).toEqual({ x: 123 });
    await expect(result2[1]).resolves.toBeUndefined();
    await expect(result2[2]).rejects.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      toExpectedEvents(events, { timeout: 1000, comparator: defaultComparator }),
    );
    expect(onError).not.toHaveBeenCalled();
  });
});
