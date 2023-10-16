import { Realtime, Types } from 'ably/promises';
import pino from 'pino';
import { Subject, lastValueFrom, take } from 'rxjs';
import { it, describe, expect, vi, beforeEach } from 'vitest';

import Model from './Model.js';
import { ModelOptions, ModelState } from './types/model.js';
import { MutationMethods } from './types/mutations.js';

vi.mock('ably/promises');

interface ModelTestContext extends ModelOptions {}

const getNthEventPromise = <T>(subject: Subject<T>, n: number) => lastValueFrom(subject.pipe(take(n)));

const getEventPromises = <T>(subject: Subject<T>, n: number) => {
  const promises: Promise<T>[] = [];
  for (let i = 0; i < n; i++) {
    promises.push(getNthEventPromise(subject, i + 1));
  }
  return promises;
};

const modelStatePromise = <T, M extends MutationMethods>(model: Model<T, M>, state: ModelState) =>
  new Promise((resolve) => model.whenState(state, model.state, resolve));

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

    const sync = vi.fn(async () => `${counter++}`);
    const model = new Model<string, {}>('test', { ably, channelName, logger });
    const mergeFn = vi.fn(async (state, event) => {
      return event.data;
    });
    await model.$register({ $sync: sync, $merge: mergeFn });

    expect(sync).toHaveBeenCalledOnce();

    let subscription = new Subject<void>();
    const subscriptionCalls = getEventPromises(subscription, 2);
    const subscriptionSpy = vi.fn<[Error | null, string?]>(() => {
      subscription.next();
    });
    model.subscribe(subscriptionSpy);

    await subscriptionCalls[0];
    expect(subscriptionSpy).toHaveBeenNthCalledWith(1, null, '0');

    await modelStatePromise(model, 'ready');

    suspendChannel();
    await modelStatePromise(model, 'ready');

    await subscriptionCalls[1];
    expect(subscriptionSpy).toHaveBeenNthCalledWith(2, null, '1');
    expect(sync).toHaveBeenCalledTimes(2);
  });
});
