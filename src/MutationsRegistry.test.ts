import { it, describe, expect, vi } from 'vitest';

import MutationsRegistry from './MutationsRegistry.js';
import type { Event } from './types/model.js';
import { addCustomMatchers } from './utilities/test/custom-matchers.js';
import { toOptimisticEventWithParams } from './utilities/test/events.js';

interface MutationsTestContext {}

describe('MutationsRegistry', () => {
  addCustomMatchers(expect);

  it<MutationsTestContext>('handleOptimsitic with default comparator and custom timeout for a single call', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();

    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const event: Event = { mutationId: 'id_1', name: 'foo', data: { bar: 123 } };

    await mutations.handleOptimistic(event);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, [toOptimisticEventWithParams(event)]);
    expect(onError).not.toHaveBeenCalled();

    const event2 = { ...event, mutationId: 'id_2' };
    await mutations.handleOptimistic(event2, { timeout: 1000 });
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(2, [toOptimisticEventWithParams(event2, { timeout: 1000 })]);
    expect(onError).not.toHaveBeenCalled();
  });

  it<MutationsTestContext>('handleOptimsitic where update rejects', async () => {
    const expectedErr = new Error('optimistic update failed');
    let onEvents = vi.fn(async () => [Promise.reject(expectedErr), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const event: Event = { mutationId: 'id_1', name: 'foo', data: { bar: 123 } };
    await expect(mutations.handleOptimistic(event)).rejects.toThrow(expectedErr);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, [toOptimisticEventWithParams(event)]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(1, expectedErr, [toOptimisticEventWithParams(event)]);

    const event2: Event = { ...event, mutationId: 'id_2' };
    await expect(mutations.handleOptimistic(event2)).rejects.toThrow(expectedErr);
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(2, [toOptimisticEventWithParams(event2)]);
    expect(onError).toHaveBeenNthCalledWith(2, expectedErr, [toOptimisticEventWithParams(event2)]);
  });

  it<MutationsTestContext>('handleOptimistic where confirmation promise rejects', async () => {
    const expectedErr = new Error('optimistic update failed');
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.reject(expectedErr)]);
    let onError = vi.fn(async () => {});
    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const event: Event = { mutationId: 'id_1', name: 'foo', data: { bar: 123 } };
    await mutations.handleOptimistic(event);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, [toOptimisticEventWithParams(event)]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(1, expectedErr, [toOptimisticEventWithParams(event)]);

    const event2 = { ...event, mutationId: 'id_2' };
    await mutations.handleOptimistic(event2);
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(2, [toOptimisticEventWithParams(event2)]);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(2, expectedErr, [toOptimisticEventWithParams(event2)]);
  });

  it<MutationsTestContext>('handleOptimistic where confirmation promise rejects and is unhandled', async () => {
    const expectedErr = new Error('optimistic update failed');
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.reject(expectedErr)]);
    let onError = vi.fn(async () => {});
    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const event: Event = { mutationId: 'id_1', name: 'foo', data: { bar: 123 } };
    await mutations.handleOptimistic(event);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, [toOptimisticEventWithParams(event)]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(1, expectedErr, [toOptimisticEventWithParams(event)]);

    // do not handle the returned promise
    await mutations.handleOptimistic(event);
  });

  it<MutationsTestContext>('handleOptimistic with a bound mutation function', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();

    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const event: Event = { mutationId: 'id_1', name: 'foo', data: { bar: 123 } };
    const [conf1] = await mutations.handleOptimistic(event);
    await expect(conf1).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, [toOptimisticEventWithParams(event)]);
    expect(onError).not.toHaveBeenCalled();

    const event2 = { ...event, mutationId: 'id_2' };
    const [conf2] = await mutations.handleOptimistic(event2);
    await expect(conf2).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(2, [toOptimisticEventWithParams(event2)]);
    expect(onError).not.toHaveBeenCalled();
  });
});
