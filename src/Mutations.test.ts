import { it, describe, expect, vi } from 'vitest';
import Mutations, { MutationMethods, MutationFunc } from './Mutations.js';
import type { Event } from './Model.js';

interface Methods extends MutationMethods {
  one: MutationFunc<[string], string>;
  two: MutationFunc<[number], { x: number }>;
}

interface MutationsTestContext {}

describe('Mutations', () => {
  it<MutationsTestContext>('invokes mutation methods', async () => {
    let onEvents = vi.fn(() => Promise.resolve());
    let onError = vi.fn();
    const mutations = new Mutations<Methods>({ onEvents, onError });
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
    let onEvents = vi.fn(() => Promise.resolve());
    let onError = vi.fn();
    const mutations = new Mutations<Pick<Methods, 'one'>>({ onEvents, onError });
    mutations.register({
      one: async (x: string) => {
        throw x;
      },
    });

    await expect(mutations.handler.one('foo')).rejects.toEqual('foo');
    expect(onEvents).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(1, 'foo', undefined);
  });

  it<MutationsTestContext>('invokes mutation methods with expectations and options', async () => {
    let onEvents = vi.fn(() => Promise.resolve());
    let onError = vi.fn();
    const mutations = new Mutations<Methods>({ onEvents, onError });
    mutations.register({
      one: async (x: string) => x,
      two: {
        func: async (x: number) => ({ x }),
        options: { timeout: 1000 },
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    const [result1, confirmed1] = await mutations.handler.one.$expect(events)('foo');
    expect(result1).toEqual('foo');
    await expect(confirmed1).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, events, undefined);
    expect(onError).not.toHaveBeenCalled();

    const [result2, confirmed2] = await mutations.handler.two.$expect(events)(123);
    expect(result2).toEqual({ x: 123 });
    await expect(confirmed2).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(2, events, { timeout: 1000 });
    expect(onError).not.toHaveBeenCalled();
  });

  it<MutationsTestContext>('mutation methods with expectations and options throw and call onError', async () => {
    let onEvents = vi.fn(() => Promise.resolve());
    let onError = vi.fn();
    const mutations = new Mutations<Methods>({ onEvents, onError });
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
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, events, undefined);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(1, 'foo', events);

    await expect(mutations.handler.two.$expect(events)(123)).rejects.toEqual(123);
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(2, events, { timeout: 1000 });
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(2, 123, events);
  });

  it<MutationsTestContext>('mutation methods with expectations and options are not confirmed', async () => {
    let onEvents = vi.fn(() => Promise.reject());
    let onError = vi.fn();
    const mutations = new Mutations<Methods>({ onEvents, onError });
    mutations.register({
      one: async (x: string) => x,
      two: {
        func: async (x: number) => ({ x }),
        options: { timeout: 1000 },
      },
    });

    const events: Event[] = [{ channel: 'channel', name: 'foo', data: { bar: 123 } }];
    const [result1, confirmed1] = await mutations.handler.one.$expect(events)('foo');
    expect(result1).toEqual('foo');
    await expect(confirmed1).rejects.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, events, undefined);
    expect(onError).not.toHaveBeenCalled();

    const [result2, confirmed2] = await mutations.handler.two.$expect(events)(123);
    expect(result2).toEqual({ x: 123 });
    await expect(confirmed2).rejects.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(2, events, { timeout: 1000 });
    expect(onError).not.toHaveBeenCalled();
  });
});
