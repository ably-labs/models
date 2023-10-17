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

    const event: Event = { name: 'foo', data: { bar: 123 } };

    await mutations.handleOptimsitic('id_1', event);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, [toOptimisticEventWithParams('id_1', event)]);
    expect(onError).not.toHaveBeenCalled();

    await mutations.handleOptimsitic('id_2', event, { timeout: 1000 });
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(2, [toOptimisticEventWithParams('id_2', event, { timeout: 1000 })]);
    expect(onError).not.toHaveBeenCalled();
  });

  it<MutationsTestContext>('handleOptimsitic uses event uuid when mutation id is missing', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();

    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const event = { uuid: 'my-event-id', name: 'foo', data: { bar: 123 } };
    await mutations.handleOptimsitic('', event);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, [toOptimisticEventWithParams('my-event-id', event)]);

    expect(onError).not.toHaveBeenCalled();
  });

  it<MutationsTestContext>('handleOptimsitic where update rejects', async () => {
    const expectedErr = new Error('optimistic update failed');
    let onEvents = vi.fn(async () => [Promise.reject(expectedErr), Promise.resolve()]);
    let onError = vi.fn();
    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const event: Event = { name: 'foo', data: { bar: 123 } };
    await expect(mutations.handleOptimsitic('id_1', event)).rejects.toThrow(expectedErr);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, [toOptimisticEventWithParams('id_1', event)]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(1, expectedErr, [toOptimisticEventWithParams('id_1', event)]);

    await expect(mutations.handleOptimsitic('id_2', event)).rejects.toThrow(expectedErr);
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(2, [toOptimisticEventWithParams('id_2', event)]);
    expect(onError).toHaveBeenNthCalledWith(2, expectedErr, [toOptimisticEventWithParams('id_2', event)]);
  });

  it<MutationsTestContext>('handleOptimistic where confirmation promise rejects', async () => {
    const expectedErr = new Error('optimistic update failed');
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.reject(expectedErr)]);
    let onError = vi.fn(async () => {});
    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const event: Event = { name: 'foo', data: { bar: 123 } };
    await mutations.handleOptimsitic('id_1', event);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, [toOptimisticEventWithParams('id_1', event)]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(1, expectedErr, [toOptimisticEventWithParams('id_1', event)]);

    await mutations.handleOptimsitic('id_2', event);
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(2, [toOptimisticEventWithParams('id_2', event)]);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(2, expectedErr, [toOptimisticEventWithParams('id_2', event)]);
  });

  it<MutationsTestContext>('handleOptimistic where confirmation promise rejects and is unhandled', async () => {
    const expectedErr = new Error('optimistic update failed');
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.reject(expectedErr)]);
    let onError = vi.fn(async () => {});
    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const event: Event = { name: 'foo', data: { bar: 123 } };
    await mutations.handleOptimsitic('id_1', event);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, [toOptimisticEventWithParams('id_1', event)]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(1, expectedErr, [toOptimisticEventWithParams('id_1', event)]);

    // do not handle the returned promise
    await mutations.handleOptimsitic('id_1', event);
  });

  it<MutationsTestContext>('handleOptimistic with a bound mutation function', async () => {
    let onEvents = vi.fn(async () => [Promise.resolve(), Promise.resolve()]);
    let onError = vi.fn();

    const mutations = new MutationsRegistry({ apply: onEvents, rollback: onError });

    const event: Event = { name: 'foo', data: { bar: 123 } };
    const [conf1] = await mutations.handleOptimsitic('id_1', event);
    await expect(conf1).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenNthCalledWith(1, [toOptimisticEventWithParams('id_1', event)]);
    expect(onError).not.toHaveBeenCalled();

    const [conf2] = await mutations.handleOptimsitic('id_2', event);
    await expect(conf2).resolves.toBeUndefined();
    expect(onEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenNthCalledWith(2, [toOptimisticEventWithParams('id_2', event)]);
    expect(onError).not.toHaveBeenCalled();
  });
});
