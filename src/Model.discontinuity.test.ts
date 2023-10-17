import { Realtime, Types } from 'ably/promises';
import pino from 'pino';
import { Subject } from 'rxjs';
import { it, describe, expect, vi, beforeEach } from 'vitest';

import Model from './Model.js';
import { ModelOptions } from './types/model.js';
import { getEventPromises, statePromise } from './utilities/test/promises.js';

vi.mock('ably/promises');

type ModelTestContext = { channelName: string } & ModelOptions;

describe('Model', () => {
  beforeEach<ModelTestContext>(async (context) => {
    const ably = new Realtime({});
    ably.connection.whenState = vi.fn<[Types.ConnectionState], Promise<Types.ConnectionStateChange>>(async () => {
      return {
        current: 'connected',
        previous: 'initialized',
      };
    });
    const logger = pino({ level: 'silent' });
    context.ably = ably;
    context.logger = logger;
    context.channelName = 'models:myModel:events';
  });

  it<ModelTestContext>('handles discontinuity with resync', async ({ channelName, ably, logger }) => {
    const channel = ably.channels.get('foo');
    let suspendChannel: (...args: any[]) => void = () => {
      throw new Error('suspended not defined');
    };

    channel.on = vi.fn<any, any>(async (name: string[], callback) => {
      if (name.includes('suspended')) {
        suspendChannel = () => {
          callback();
        };
      }
    });
    channel.subscribe = vi.fn<any, any>();
    channel.attach = vi.fn<any, any>();
    channel.detach = vi.fn<any, any>();
    ably.channels.release = vi.fn<any, any>();

    let counter = 0;

    const sync = vi.fn(async () => ({
      data: `${counter++}`,
      sequenceID: '0',
      stateTimestamp: new Date(),
    }));
    const mergeFn = vi.fn(async (_, event) => {
      return event.data;
    });

    const model = new Model<string>('test', { sync: sync, merge: mergeFn }, { ably, channelName, logger });
    await model.sync();

    expect(sync).toHaveBeenCalledOnce();

    let subscription = new Subject<void>();
    const subscriptionCalls = getEventPromises(subscription, 2);
    const subscriptionSpy = vi.fn<[Error | null, string?]>(() => {
      subscription.next();
    });
    model.subscribe(subscriptionSpy);

    await subscriptionCalls[0];
    expect(subscriptionSpy).toHaveBeenNthCalledWith(1, null, '0');

    await statePromise(model, 'ready');

    suspendChannel();
    await statePromise(model, 'ready');

    await subscriptionCalls[1];
    expect(subscriptionSpy).toHaveBeenNthCalledWith(2, null, '1');
    expect(sync).toHaveBeenCalledTimes(2);
  });
});
