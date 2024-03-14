import { Realtime } from 'ably/promises';
import pino from 'pino';
import { Subject } from 'rxjs';
import { it, describe, expect, beforeEach, afterEach, vi } from 'vitest';

import Model from './Model.js';
import { defaultSyncOptions, defaultEventBufferOptions, defaultOptimisticEventOptions } from './Options.js';
import type { ModelOptions } from './types/model.js';
import { createAblyApp } from './utilities/test/createAblyApp.js';
import { getEventPromises } from './utilities/test/promises.js';

interface TestContext extends ModelOptions {
  model: Model<any>;
  channelName: string;
  eventData: {
    name: string;
    data: any;
    mutationId: string;
  };
  syncData: Record<number, any>;
}

describe('Model integration', () => {
  beforeEach<TestContext>(async (context) => {
    const channelName = 'test-channel';
    const data = await createAblyApp({
      keys: [{}],
      namespaces: [{ id: channelName, persisted: true }],
      channels: [
        {
          name: channelName,
          presence: [
            { clientId: 'John', data: 'john@test.com' },
            { clientId: 'Dave', data: 'dave@test.com' },
          ],
        },
      ],
    });
    const syncData = {
      1: {
        data: {
          name: 'John',
          email: 'john@test.io',
        },
        sequenceId: '1',
      },
      2: {
        data: {
          city: 'London',
          country: 'Canada',
        },
        sequenceId: '2',
      },
    };
    const ably = new Realtime({
      key: data.keys[0].keyStr,
      environment: 'sandbox',
    });
    const logger = pino({ level: 'debug' });
    const model = new Model(
      channelName,
      {
        sync: async (id: string) => syncData[id],
        merge: (state, event) => (state ? { ...state, ...event.data } : event.data),
      },
      {
        ably,
        channelName,
        logger,
        syncOptions: defaultSyncOptions,
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );

    context.model = model;
    context.channelName = channelName;
    context.ably = ably;

    context.eventData = {
      name: 'update',
      data: {
        foo: 34,
      },
      mutationId: 'some-id-1',
    };
    context.syncData = syncData;
  });

  afterEach<TestContext>(async ({ model }) => {
    await model.dispose();
    vi.restoreAllMocks();
  });

  it<TestContext>('changes state on sync, pause, resume, dispose', async ({ model }) => {
    expect(model.state).toEqual('initialized');

    const sync = model.sync(1);
    expect(model.state).toEqual('syncing');

    await sync;
    expect(model.state).toEqual('ready');

    await model.pause();
    expect(model.state).toEqual('paused');

    await model.resume();
    expect(model.state).toEqual('ready');

    await model.dispose();
    expect(model.state).toEqual('disposed');
  });

  it<TestContext>('successfully sets the data from the event in optimistic()', async ({
    ably,
    model,
    channelName,
    eventData,
    syncData,
  }) => {
    await model.sync(1);
    expect(model.data.optimistic).toEqual(syncData[1].data);

    let subscription = new Subject<void>();
    const subscriptionCalls = getEventPromises(subscription, 3);
    const subscriptionSpy = vi.fn(() => subscription.next());
    const finalData = { ...syncData[1].data, ...eventData.data };

    model.subscribe(subscriptionSpy);

    await subscriptionCalls[0];
    expect(model.data.confirmed).toEqual(syncData[1].data);

    const [confirmation] = await model.optimistic(eventData);

    await subscriptionCalls[1];
    expect(model.data.optimistic).toEqual(finalData);

    const channel = ably.channels.get(channelName);
    await channel.publish({
      data: eventData.data,
      name: 'update',
      extras: {
        headers: {
          'x-ably-models-event-uuid': eventData.mutationId,
        },
      },
    });

    await subscriptionCalls[2];
    await confirmation;

    expect(subscriptionSpy).toHaveBeenCalledTimes(3);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(3, null, finalData);
    expect(model.data.confirmed).toEqual(finalData);
  });

  it<TestContext>('rejects the data in optimistic() and rolls back the changes if back-end rejects the data', async ({
    ably,
    model,
    channelName,
    eventData,
    syncData,
  }) => {
    await model.sync(1);
    let subscription = new Subject<void>();
    const subscriptionCalls = getEventPromises(subscription, 2);
    const subscriptionSpy = vi.fn(() => subscription.next());
    const finalData = { ...syncData[1].data, ...eventData.data };

    model.subscribe(subscriptionSpy);
    await model.optimistic(eventData);
    expect(model.data.optimistic).toEqual(finalData);

    const channel = ably.channels.get(channelName);
    await channel.publish({
      data: eventData.data,
      name: 'update',
      extras: {
        headers: {
          'x-ably-models-event-uuid': eventData.mutationId,
          'x-ably-models-reject': true,
        },
      },
    });

    await subscriptionCalls[0];
    expect(model.data.confirmed).toEqual(syncData[1].data);

    await subscriptionCalls[1];

    expect(subscriptionSpy).toHaveBeenCalledTimes(2);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(2, null, finalData);
    expect(model.data.confirmed).toEqual(syncData[1].data);
  });

  it<TestContext>('rejects the data and rolls back the changes if optimistic() timeouts', async ({
    model,
    eventData,
    syncData,
  }) => {
    await model.sync(1);

    let subscription = new Subject<void>();
    const subscriptionCalls = getEventPromises(subscription, 2);
    const subscriptionSpy = vi.fn(() => subscription.next());

    model.subscribe(subscriptionSpy);

    await subscriptionCalls[0];
    expect(model.data.confirmed).toEqual(syncData[1].data);

    const [confirmation] = await model.optimistic(eventData, { timeout: 10 });
    expect(model.data.confirmed).toEqual(syncData[1].data);
    expect(model.data.optimistic).toEqual({ ...syncData[1].data, ...eventData.data });

    await subscriptionCalls[1];
    expect(model.data.confirmed).toEqual(syncData[1].data);
    await expect(confirmation).rejects.toThrow('timed out waiting for event confirmation');
  });

  it<TestContext>('rebases optimistic data on top of subsequent event data', async ({
    ably,
    model,
    channelName,
    eventData,
    syncData,
  }) => {
    const channel = ably.channels.get(channelName);
    const otherEvent = {
      data: {
        comment: "I'm blazingly fast!",
      },
      mutationId: 'some-id-2',
      name: 'updateComment',
    };
    await model.sync(1);

    let subscription = new Subject<void>();
    const subscriptionCalls = getEventPromises(subscription, 5);
    const subscriptionSpy = vi.fn(() => subscription.next());

    model.subscribe(subscriptionSpy);

    const [confirmation] = await model.optimistic(eventData);
    expect(model.data.optimistic).toEqual({ ...syncData[1].data, ...eventData.data });

    await channel.publish({
      ...otherEvent,
      extras: {
        headers: {
          'x-ably-models-event-uuid': otherEvent.mutationId,
        },
      },
    });

    await subscriptionCalls[2];
    expect(model.data.confirmed).toEqual({
      ...syncData[1].data,
      ...otherEvent.data,
    });

    await channel.publish({
      ...eventData,
      extras: {
        headers: {
          'x-ably-models-event-uuid': eventData.mutationId,
        },
      },
    });

    await subscriptionCalls[5];
    await confirmation;

    expect(model.data.confirmed).toEqual({
      ...syncData[1].data,
      ...eventData.data,
      ...otherEvent.data,
    });
  });
});
