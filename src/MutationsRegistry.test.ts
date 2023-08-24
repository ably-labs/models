import { it, describe, expect, vi } from 'vitest';

import MutationsRegistry, { defaultComparator, DEFAULT_OPTIONS } from './MutationsRegistry.js';
import type { Event } from './types/model.js';
import type { MutationMethods, MutationFunc, EventComparator, MutationContext } from './types/mutations.js';
import { addCustomMatchers } from './utilities/test/custom-matchers.js';
import { toOptimisticEventsWithParams } from './utilities/test/events.js';

interface Methods extends MutationMethods {
  one: MutationFunc<[string], string>;
  two: MutationFunc<[number], { x: number }>;
}

interface MutationsTestContext {}

describe('MutationsRegistry', () => {
  addCustomMatchers(expect);

  it<MutationsTestContext>('invokes mutation methods', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry<Methods>({ apply: onEvents, rollback: onError });
    mutations.register({
      one: async (_, x: string) => x,
      two: {
        func: async (_, x: number) => ({ x }),
        options: { timeout: 1000 },
      },
    });
    await expect(mutations.handler.one('foo')).resolves.toEqual('foo');
    await expect(mutations.handler.two(123)).resolves.toEqual({ x: 123 });
    expect(onEvents).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it<MutationsTestContext>('mutation method throws', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry<Pick<Methods, 'one'>>({ apply: onEvents, rollback: onError });
    mutations.register({
      one: async (_, x: string) => {
        throw x;
      },
    });

    await expect(mutations.handler.one('foo')).rejects.toEqual('foo');
    expect(onEvents).not.toHaveBeenCalled();
    // we're not setting expected events, so the error callback should not be invoked
    expect(onError).toHaveBeenCalledTimes(0);
  });

  it<MutationsTestContext>('mutation method throws at same time as optimistic update rejects', async () => {
    let onEvents = vi.fn(async () => [Promise.reject('optimistic update failed'), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry<Pick<Methods, 'one'>>({ apply: onEvents, rollback: onError });
    mutations.register({
      one: async (_, x: string) => {
        throw x;
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    const expectedEventsMatcher = expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events));
    await expect(mutations.handler.one.$expect({ events })('foo')).rejects.toEqual(
      new Error('optimistic update failed'),
    );
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, expectedEventsMatcher);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(1, new Error('optimistic update failed'), expectedEventsMatcher);
  });

  it<MutationsTestContext>('$expect with options configured globally (custom comparator)', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();

    const nameOnlyComparator: EventComparator = (optimistic: Event, confirmed: Event) =>
      optimistic.name === confirmed.name;

    const mutations = new MutationsRegistry<Methods>(
      { apply: onEvents, rollback: onError },
      {
        comparator: nameOnlyComparator, // global default comparator
      },
    );
    mutations.register({
      one: async (_, x: string) => x,
      two: {
        func: async (_, x: number) => ({ x }),
        options: {
          timeout: 1000, // partial invocation-specific config
        },
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    const result1 = await mutations.handler.one.$expect({ events })('foo');
    expect(result1[0]).toEqual('foo');
    await expect(result1[1]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(
      1,
      expect.toEqualIgnoringUUID(
        toOptimisticEventsWithParams(events, { timeout: DEFAULT_OPTIONS.timeout, comparator: nameOnlyComparator }),
      ),
    );
    expect(onError).not.toHaveBeenCalled();

    const result2 = await mutations.handler.two.$expect({ events })(123);
    expect(result2[0]).toEqual({ x: 123 });
    await expect(result2[1]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      expect.toEqualIgnoringUUID(
        toOptimisticEventsWithParams(events, { timeout: 1000, comparator: nameOnlyComparator }),
      ),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it<MutationsTestContext>('$expect with options configured on registration (default comparator)', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry<Methods>({ apply: onEvents, rollback: onError });
    mutations.register({
      one: async (_, x: string) => x,
      two: {
        func: async (_, x: number) => ({ x }),
        options: { timeout: 1000 },
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    const result1 = await mutations.handler.one.$expect({ events })('foo');
    expect(result1[0]).toEqual('foo');
    await expect(result1[1]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)));
    expect(onError).not.toHaveBeenCalled();

    const result2 = await mutations.handler.two.$expect({ events })(123);
    expect(result2[0]).toEqual({ x: 123 });
    await expect(result2[1]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      expect.toEqualIgnoringUUID(
        toOptimisticEventsWithParams(events, { timeout: 1000, comparator: defaultComparator }),
      ),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it<MutationsTestContext>('$expect with options configured on registration (custom comparator)', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();

    const nameOnlyComparator: EventComparator = (optimistic: Event, confirmed: Event) =>
      optimistic.name === confirmed.name;

    const mutations = new MutationsRegistry<Methods>({ apply: onEvents, rollback: onError });
    mutations.register({
      one: {
        func: async (_, x: string) => x,
        options: {
          comparator: nameOnlyComparator,
        },
      },
      two: {
        func: async (_, x: number) => ({ x }),
        options: {
          timeout: 1000,
          comparator: nameOnlyComparator,
        },
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    const result1 = await mutations.handler.one.$expect({ events })('foo');
    expect(result1[0]).toEqual('foo');
    await expect(result1[1]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(
      1,
      expect.toEqualIgnoringUUID(
        toOptimisticEventsWithParams(events, { timeout: DEFAULT_OPTIONS.timeout, comparator: nameOnlyComparator }),
      ),
    );
    expect(onError).not.toHaveBeenCalled();

    const result2 = await mutations.handler.two.$expect({ events })(123);
    expect(result2[0]).toEqual({ x: 123 });
    await expect(result2[1]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      expect.toEqualIgnoringUUID(
        toOptimisticEventsWithParams(events, { timeout: 1000, comparator: nameOnlyComparator }),
      ),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it<MutationsTestContext>('$expect with options configured on specific invocation (custom comparator)', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();

    const nameOnlyComparator: EventComparator = (optimistic: Event, confirmed: Event) =>
      optimistic.name === confirmed.name;

    const mutations = new MutationsRegistry<Methods>({ apply: onEvents, rollback: onError });
    mutations.register({
      one: async (_, x: string) => x,
      two: async (_, x: number) => ({ x }),
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    const result1 = await mutations.handler.one.$expect({ events, options: { comparator: nameOnlyComparator } })('foo');
    expect(result1[0]).toEqual('foo');
    await expect(result1[1]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(
      1,
      expect.toEqualIgnoringUUID(
        toOptimisticEventsWithParams(events, { timeout: DEFAULT_OPTIONS.timeout, comparator: nameOnlyComparator }),
      ),
    );
    expect(onError).not.toHaveBeenCalled();

    const result2 = await mutations.handler.two.$expect({
      events,
      options: {
        timeout: 1000,
        comparator: nameOnlyComparator,
      },
    })(123);
    expect(result2[0]).toEqual({ x: 123 });
    await expect(result2[1]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      expect.toEqualIgnoringUUID(
        toOptimisticEventsWithParams(events, { timeout: 1000, comparator: nameOnlyComparator }),
      ),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it<MutationsTestContext>('$expect where mutation methods have access to expected events on context', async () => {
    let onEvents = async () => [Promise.resolve(), Promise.resolve()];
    let onError = async () => {};
    const mutations = new MutationsRegistry<Methods>({ apply: onEvents, rollback: onError });
    let oneEvents: Event[] | undefined;
    let twoEvents: Event[] | undefined;
    mutations.register({
      one: async function (context: MutationContext, x: string) {
        oneEvents = context.events;
        return x;
      },
      two: {
        func: async function (context: MutationContext, x: number) {
          twoEvents = context.events;
          return { x };
        },
        options: { timeout: 1000 },
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    const result1 = await mutations.handler.one.$expect({ events })('foo');
    expect(result1[0]).toEqual('foo');
    expect(oneEvents).toEqual(events);
    await expect(result1[1]).resolves.toBeUndefined();

    const result2 = await mutations.handler.two.$expect({ events })(123);
    expect(result2[0]).toEqual({ x: 123 });
    expect(twoEvents).toEqual(events);
    await expect(result2[1]).resolves.toBeUndefined();
  });

  it<MutationsTestContext>('$expect where mutation throws', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry<Methods>({ apply: onEvents, rollback: onError });
    mutations.register({
      one: async (_, x: string) => {
        throw x;
      },
      two: {
        func: async (_, x: number) => {
          throw x;
        },
        options: { timeout: 1000 },
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    await expect(mutations.handler.one.$expect({ events })('foo')).rejects.toEqual(new Error('foo'));
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(
      1,
      new Error('foo'),
      expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)),
    );

    await expect(mutations.handler.two.$expect({ events })(123)).rejects.toEqual(new Error('123'));
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      expect.toEqualIgnoringUUID(
        toOptimisticEventsWithParams(events, { timeout: 1000, comparator: defaultComparator }),
      ),
    );
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(
      2,
      new Error('123'),
      expect.toEqualIgnoringUUID(
        toOptimisticEventsWithParams(events, { timeout: 1000, comparator: defaultComparator }),
      ),
    );
  });

  it<MutationsTestContext>('$expect where optimistic update rejects', async () => {
    const expectedErr = new Error('optimistic update failed');
    let onEvents = vi.fn(async () => [Promise.reject(expectedErr), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry<Methods>({ apply: onEvents, rollback: onError });
    mutations.register({
      one: async (_, x: string) => x,
      two: {
        func: async (_, x: number) => ({ x }),
        options: { timeout: 1000 },
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    await expect(mutations.handler.one.$expect({ events })('foo')).rejects.toThrow(expectedErr);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(
      1,
      expectedErr,
      expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)),
    );

    await expect(mutations.handler.two.$expect({ events })(123)).rejects.toThrow(expectedErr);
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      expect.toEqualIgnoringUUID(
        toOptimisticEventsWithParams(events, { timeout: 1000, comparator: defaultComparator }),
      ),
    );
    expect(onError).toHaveBeenNthCalledWith(
      2,
      expectedErr,
      expect.toEqualIgnoringUUID(
        toOptimisticEventsWithParams(events, { timeout: 1000, comparator: defaultComparator }),
      ),
    );
  });

  it<MutationsTestContext>('$expect where confirmation promise rejects', async () => {
    const expectedErr = new Error('optimistic update failed');
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.reject(expectedErr)]);
    let onError = vi.fn(async () => {});
    const mutations = new MutationsRegistry<Methods>({ apply: onEvents, rollback: onError });
    mutations.register({
      one: async (_, x: string) => x,
      two: {
        func: async (_, x: number) => ({ x }),
        options: { timeout: 1000 },
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    const result1 = await mutations.handler.one.$expect({ events })('foo');
    expect(result1[0]).toEqual('foo');
    await expect(result1[1]).rejects.toThrow(expectedErr);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(
      1,
      expectedErr,
      expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)),
    );

    const result2 = await mutations.handler.two.$expect({ events })(123);
    expect(result2[0]).toEqual({ x: 123 });
    await expect(result2[1]).rejects.toThrow(expectedErr);
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      expect.toEqualIgnoringUUID(
        toOptimisticEventsWithParams(events, { timeout: 1000, comparator: defaultComparator }),
      ),
    );
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(
      2,
      expectedErr,
      expect.toEqualIgnoringUUID(
        toOptimisticEventsWithParams(events, { timeout: 1000, comparator: defaultComparator }),
      ),
    );
  });

  it<MutationsTestContext>('$expect where confirmation promise rejects and is unhandled', async () => {
    const expectedErr = new Error('optimistic update failed');
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.reject(expectedErr)]);
    let onError = vi.fn(async () => {});
    const mutations = new MutationsRegistry<Methods>({ apply: onEvents, rollback: onError });
    mutations.register({
      one: async (_, x: string) => x,
      two: {
        func: async (_, x: number) => ({ x }),
        options: { timeout: 1000 },
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    const result1 = await mutations.handler.one.$expect({ events })('foo');
    expect(result1[0]).toEqual('foo');
    await expect(result1[1]).rejects.toThrow(expectedErr);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(
      1,
      expectedErr,
      expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events)),
    );

    // do not handle the returned promise
    await mutations.handler.two.$expect({ events })(123);
  });

  it<MutationsTestContext>('$expect with empty events', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn(async () => {});
    const mutations = new MutationsRegistry<Methods>({ apply: onEvents, rollback: onError });
    mutations.register({
      one: async (_, x: string) => x,
      two: {
        func: async (_, x: number) => ({ x }),
        options: { timeout: 1000 },
      },
    });

    const result1 = await mutations.handler.one.$expect({ events: [] })('foo');
    expect(result1[0]).toEqual('foo');
    await expect(result1[1]).resolves.toBeUndefined();
    expect(onEvents).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    const result2 = await mutations.handler.two.$expect({ events: [] })(123);
    expect(result2[0]).toEqual({ x: 123 });
    await expect(result2[1]).resolves.toBeUndefined();
  });

  it<MutationsTestContext>('$expect with a bound mutation function', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();

    const mutations = new MutationsRegistry<Methods>({ apply: onEvents, rollback: onError });

    const one = async function (_, x: string) {
      return `${x}${this.x}`;
    };

    const two = async function (_, x: number) {
      return { x: x + this.x };
    };

    mutations.register({ one: one.bind({ x: 'bar' }), two: two.bind({ x: 1 }) });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    const result1 = await mutations.handler.one.$expect({ events })('foo');
    expect(result1[0]).toEqual('foobar');
    await expect(result1[1]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(
      1,
      expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events, DEFAULT_OPTIONS)),
    );
    expect(onError).not.toHaveBeenCalled();

    const result2 = await mutations.handler.two.$expect({ events })(1);
    expect(result2[0]).toEqual({ x: 2 });
    await expect(result2[1]).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(
      2,
      expect.toEqualIgnoringUUID(toOptimisticEventsWithParams(events, DEFAULT_OPTIONS)),
    );
    expect(onError).not.toHaveBeenCalled();
  });
});
