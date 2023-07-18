import { it, describe, expect, afterEach, vi, beforeEach } from 'vitest';
import { Realtime, Types } from 'ably/promises';
import { Subject, lastValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import pino from 'pino';

import { createMessage, customMessage } from './utilities/test/messages.js';
import Model, { ModelState, ModelStateChange, Versioned, Mutation, ModelOptions } from './Model.js';
import { StreamOptions, IStream, StreamState } from './Stream.js';
import { IStreamProvider } from './StreamProvider.js';

vi.mock('ably/promises');

// Mocks the StreamProvider import so that we can modify the Stream instances
// used by the model to spy on their methods.
// This implementation ensures that all instances of StreamProvider use the
// same cache of Stream instances so that the StreamProvider instantiated in the
// model returns the same Stream instances as the StreamProvider instantiated
// in these tests.
vi.mock('./StreamProvider', () => {
  class MockStream implements IStream {
    constructor(readonly options: Pick<StreamOptions, 'channel'>) {}
    get state() {
      return StreamState.READY;
    }
    get channel() {
      return this.options.channel;
    }
    async pause() {}
    async resume() {}
    subscribe(): void {}
    unsubscribe(): void {}
    async dispose() {}
  }
  const streams: { [key: string]: IStream } = {};

  return {
    default: class implements IStreamProvider {
      getOrCreate(options: Pick<StreamOptions, 'channel'>) {
        if (!streams[options.channel]) {
          streams[options.channel] = new MockStream(options);
        }
        return streams[options.channel];
      }
      get streams() {
        return streams;
      }
    },
  };
});

type TestData = {
  foo: string;
  bar: {
    baz: number;
  };
};

const simpleTestData: Versioned<TestData> = {
  version: 1,
  data: {
    foo: 'foobar',
    bar: {
      baz: 1,
    },
  },
};

interface ModelTestContext extends Omit<ModelOptions<any>, 'sync'> {
  streams: IStreamProvider;
}

const modelStatePromise = <T>(model: Model<T>, state: ModelState) =>
  new Promise((resolve) => model.whenState(state, model.state, resolve));

const getNthEventPromise = <T>(subject: Subject<T>, n: number) => lastValueFrom(subject.pipe(take(n)));

const getEventPromises = <T>(subject: Subject<T>, n: number) => {
  const promises: Promise<T>[] = [];
  for (let i = 0; i < n; i++) {
    promises.push(getNthEventPromise(subject, i + 1));
  }
  return promises;
};

describe('Model', () => {
  beforeEach<ModelTestContext>(async (context) => {
    const ably = new Realtime({});
    const logger = pino({ level: 'silent' });
    context.ably = ably;
    context.logger = logger;
    const { default: provider } = await import('./StreamProvider.js');
    context.streams = new provider({ ably, logger });
  });

  afterEach<ModelTestContext>(() => {
    vi.restoreAllMocks();
  });

  it<ModelTestContext>('enters ready state after sync', async ({ ably, logger }) => {
    // the promise returned by the subscribe method resolves when we have successfully attached to the channel
    let completeSync;
    const synchronised = new Promise((resolve) => (completeSync = resolve));
    const sync = vi.fn(async () => {
      await synchronised;
      return simpleTestData;
    });

    const model = new Model<TestData>('test', { ably, logger, sync });
    await modelStatePromise(model, ModelState.PREPARING);
    completeSync();
    await modelStatePromise(model, ModelState.READY);
    expect(sync).toHaveBeenCalledOnce();
    expect(model.optimistic).toEqual(simpleTestData.data);
    expect(model.confirmed).toEqual(simpleTestData.data);
  });

  it<ModelTestContext>('pauses and resumes the model', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();
    s1.pause = vi.fn();
    s2.pause = vi.fn();
    s1.resume = vi.fn();
    s2.resume = vi.fn();
    const sync = vi.fn(async () => simpleTestData);

    const model = new Model<TestData>('test', { ably, logger, sync });

    // register update function so that streams get created
    model.registerUpdate(async (state) => state, { channel: 's1', event: 'event' });
    model.registerUpdate(async (state) => state, { channel: 's2', event: 'event' });

    await modelStatePromise(model, ModelState.READY);
    expect(s1.subscribe).toHaveBeenCalledOnce();
    expect(s2.subscribe).toHaveBeenCalledOnce();

    model.pause();
    await modelStatePromise(model, ModelState.PAUSED);
    expect(s1.pause).toHaveBeenCalledOnce();
    expect(s2.pause).toHaveBeenCalledOnce();

    model.resume();
    await modelStatePromise(model, ModelState.READY);
    expect(s1.resume).toHaveBeenCalledOnce();
    expect(s2.resume).toHaveBeenCalledOnce();
  });

  it<ModelTestContext>('disposes of the model', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();
    s1.unsubscribe = vi.fn();
    s2.unsubscribe = vi.fn();
    const sync = vi.fn(async () => simpleTestData);

    const model = new Model<TestData>('test', { ably, logger, sync });

    // register update function so that streams get created
    model.registerUpdate(async (state) => state, { channel: 's1', event: 'event' });
    model.registerUpdate(async (state) => state, { channel: 's2', event: 'event' });

    await modelStatePromise(model, ModelState.READY);
    expect(sync).toHaveBeenCalledOnce();
    expect(s1.subscribe).toHaveBeenCalledOnce();
    expect(s2.subscribe).toHaveBeenCalledOnce();

    model.dispose();
    await modelStatePromise(model, ModelState.DISPOSED);
    expect(s1.unsubscribe).toHaveBeenCalledOnce();
    expect(s2.unsubscribe).toHaveBeenCalledOnce();
  });

  it<ModelTestContext>('subscribes to updates', async ({ ably, logger, streams }) => {
    const data: Versioned<any> = {
      version: 0,
      data: 'data_0',
    };

    // event subjects used to invoke the stream subscription callbacks
    // registered by the model, to simulate stream data
    const events = {
      e1: new Subject<Types.Message>(),
      e2: new Subject<Types.Message>(),
    };

    streams.getOrCreate({ channel: 's1' }).subscribe = vi.fn((callback) =>
      events.e1.subscribe((message) => callback(null, message)),
    );
    streams.getOrCreate({ channel: 's2' }).subscribe = vi.fn((callback) =>
      events.e2.subscribe((message) => callback(null, message)),
    );

    const sync = vi.fn(async () => data); // defines initial version of model
    const model = new Model<string>('test', { ably, logger, sync });

    const update1 = vi.fn(async (state, event) => event.data);
    model.registerUpdate(update1, { channel: 's1', event: 'name_1' });
    const update2 = vi.fn(async (state, event) => event.data);
    model.registerUpdate(update2, { channel: 's2', event: 'name_2' });
    const update3 = vi.fn(async (state, event) => event.data);
    model.registerUpdate(update3, { channel: 's1', event: 'name_3' });
    model.registerUpdate(update3, { channel: 's2', event: 'name_3' });

    await modelStatePromise(model, ModelState.READY);
    expect(sync).toHaveBeenCalledOnce();

    let subscription = new Subject<void>();
    const subscriptionSpy = vi.fn<[Error | null | undefined, string | undefined]>(() => subscription.next());
    model.subscribe(subscriptionSpy);

    const subscriptionCalls = getEventPromises(subscription, 4);

    events.e1.next(createMessage(1));
    await subscriptionCalls[0];
    expect(update1).toHaveBeenCalledTimes(1);
    expect(update2).toHaveBeenCalledTimes(0);
    expect(update3).toHaveBeenCalledTimes(0);
    expect(subscriptionSpy).toHaveBeenCalledTimes(1);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(1, null, 'data_1');

    events.e2.next(createMessage(2));
    await subscriptionCalls[1];
    expect(update1).toHaveBeenCalledTimes(1);
    expect(update2).toHaveBeenCalledTimes(1);
    expect(update3).toHaveBeenCalledTimes(0);
    expect(subscriptionSpy).toHaveBeenCalledTimes(2);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_2');

    events.e1.next(createMessage(3));
    await subscriptionCalls[2];
    expect(update1).toHaveBeenCalledTimes(1);
    expect(update2).toHaveBeenCalledTimes(1);
    expect(update3).toHaveBeenCalledTimes(1);
    expect(subscriptionSpy).toHaveBeenCalledTimes(3);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(3, null, 'data_3');

    events.e2.next(createMessage(3));
    await subscriptionCalls[3];
    expect(update1).toHaveBeenCalledTimes(1);
    expect(update2).toHaveBeenCalledTimes(1);
    expect(update3).toHaveBeenCalledTimes(2);
    expect(subscriptionSpy).toHaveBeenCalledTimes(4);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(4, null, 'data_3');

    expect(model.optimistic).toEqual('data_3');
    expect(model.confirmed).toEqual('data_3');
  });

  it<ModelTestContext>('executes a registered mutation', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();
    const model = new Model<string>('test', { ably, logger, sync: async () => ({ version: 1, data: 'foobar' }) });
    await modelStatePromise(model, ModelState.READY);

    const mutation: Mutation = {
      mutate: vi.fn(async () => 'test'),
    };
    model.registerMutation('foo', mutation);
    expect(mutation.mutate).toHaveBeenCalledTimes(0);
    await model.mutate<[string, number], void>('foo', { args: ['bar', 123] });
    expect(mutation.mutate).toHaveBeenCalledTimes(1);
    expect(mutation.mutate).toHaveBeenCalledWith('bar', 123);
  });

  it<ModelTestContext>('fails to register a duplicate mutation', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();
    const model = new Model<string>('test', { ably, logger, sync: async () => ({ version: 1, data: 'foobar' }) });
    await modelStatePromise(model, ModelState.READY);

    const mutation: Mutation = { mutate: vi.fn() };
    model.registerMutation('foo', mutation);
    expect(mutation.mutate).toHaveBeenCalledTimes(0);
    expect(() => model.registerMutation('foo', mutation)).toThrowError(
      `mutation with name 'foo' already registered on model 'test'`,
    );
  });

  it<ModelTestContext>('fails to execute mutation with unregistered stream', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();
    const model = new Model<string>('test', { ably, logger, sync: async () => ({ version: 1, data: 'foobar' }) });
    await modelStatePromise(model, ModelState.READY);

    const mutation: Mutation = {
      mutate: vi.fn(async () => 'test'),
    };
    model.registerMutation('foo', mutation);
    expect(mutation.mutate).toHaveBeenCalledTimes(0);
    await expect(model.mutate('foo', { events: [{ channel: 'unknown', name: 'foo' }] })).rejects.toThrow(
      "stream with name 'unknown' not registered on model 'test'",
    );
  });

  it<ModelTestContext>('updates model state with optimistic event', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();
    const model = new Model<string>('test', { ably, logger, sync: async () => ({ version: 1, data: 'data_0' }) });
    await modelStatePromise(model, ModelState.READY);

    const update1 = vi.fn(async (state, event) => event.data);
    model.registerUpdate(update1, { channel: 's1', event: 'testEvent' });

    const mutation: Mutation = {
      mutate: vi.fn(async () => 'test'),
    };
    model.registerMutation('foo', mutation);

    let optimisticSubscription = new Subject<void>();
    const optimisticSubscriptionSpy = vi.fn<[Error | null | undefined, string | undefined]>(() =>
      optimisticSubscription.next(),
    );
    model.subscribe(optimisticSubscriptionSpy);
    const optimisticSubscriptionCall = getNthEventPromise(optimisticSubscription, 1);

    let confirmedSubscription = new Subject<void>();
    const confirmedSubscriptionSpy = vi.fn<[Error | null | undefined, string | undefined]>(() =>
      confirmedSubscription.next(),
    );
    model.subscribe(confirmedSubscriptionSpy, { optimistic: false });

    await model.mutate<[string], void>('foo', { events: [{ channel: 's1', name: 'testEvent', data: 'data_1' }] });

    await optimisticSubscriptionCall;
    expect(model.optimistic).toEqual('data_1');
    expect(model.confirmed).toEqual('data_0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledOnce();
    expect(optimisticSubscriptionSpy).toHaveBeenCalledWith(null, 'data_1');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(0);
  });

  it<ModelTestContext>('confirms an optimistic event', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const model = new Model<string>('test', { ably, logger, sync: async () => ({ version: 1, data: 'data_0' }) });
    await modelStatePromise(model, ModelState.READY);

    const update1 = vi.fn(async (state, event) => event.data);
    model.registerUpdate(update1, { channel: 's1', event: 'testEvent' });

    const mutation: Mutation = {
      mutate: vi.fn(async () => 'test'),
    };
    model.registerMutation('foo', mutation);

    let optimisticSubscription = new Subject<void>();
    const optimisticSubscriptionSpy = vi.fn<[Error | null | undefined, string | undefined]>(() =>
      optimisticSubscription.next(),
    );
    model.subscribe(optimisticSubscriptionSpy);
    const optimisticSubscriptionCall = getNthEventPromise(optimisticSubscription, 1);

    let confirmedSubscription = new Subject<void>();
    const confirmedSubscriptionSpy = vi.fn<[Error | null | undefined, string | undefined]>(() =>
      confirmedSubscription.next(),
    );
    model.subscribe(confirmedSubscriptionSpy, { optimistic: false });
    const confirmedSubscriptionCall = getNthEventPromise(confirmedSubscription, 1);

    await model.mutate<[string], void>('foo', { events: [{ channel: 's1', name: 'testEvent', data: 'data_1' }] });

    await optimisticSubscriptionCall;
    expect(model.optimistic).toEqual('data_1');
    expect(model.confirmed).toEqual('data_0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledOnce();
    expect(optimisticSubscriptionSpy).toHaveBeenCalledWith(null, 'data_1');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(0);

    events.e1.next(customMessage('id_1', 'testEvent', 'data_1'));
    await confirmedSubscriptionCall;
    expect(confirmedSubscriptionSpy).toHaveBeenCalledOnce();
    expect(confirmedSubscriptionSpy).toHaveBeenCalledWith(null, 'data_1');
    expect(model.confirmed).toEqual('data_1');
  });

  it<ModelTestContext>('confirms optimistic events out of order', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const model = new Model<string>('test', { ably, logger, sync: async () => ({ version: 1, data: '0' }) });
    await modelStatePromise(model, ModelState.READY);

    const update1 = vi.fn(async (state, event) => state + event.data);
    model.registerUpdate(update1, { channel: 's1', event: 'testEvent' });

    const mutation: Mutation = {
      mutate: vi.fn(async () => 'test'),
    };
    model.registerMutation('foo', mutation);

    let optimisticSubscription = new Subject<void>();
    const optimisticSubscriptionSpy = vi.fn<[Error | null | undefined, string | undefined]>(() => {
      optimisticSubscription.next();
    });
    model.subscribe(optimisticSubscriptionSpy);
    const optimisticSubscriptionCall = getEventPromises(optimisticSubscription, 3);

    let confirmedSubscription = new Subject<void>();
    const confirmedSubscriptionSpy = vi.fn<[Error | null | undefined, string | undefined]>(() => {
      confirmedSubscription.next();
    });
    model.subscribe(confirmedSubscriptionSpy, { optimistic: false });
    const confirmedSubscriptionCalls = getEventPromises(confirmedSubscription, 3);

    await model.mutate<[string, string], void>('foo', { events: [{ channel: 's1', name: 'testEvent', data: '1' }] });
    await model.mutate<[string, string], void>('foo', { events: [{ channel: 's1', name: 'testEvent', data: '2' }] });

    // optimistic updates are applied in the order the mutations were called
    await optimisticSubscriptionCall[0];
    await optimisticSubscriptionCall[1];
    expect(model.optimistic).toEqual('012');
    expect(model.confirmed).toEqual('0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(1, null, '01');
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '012');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(0);

    // You would typically expect the confirmation events to be sent (and arrive) in the
    // same order as their corresponding mutations were applied.
    // However, if this is not the case, we still accept the confirmation, but the
    // optimistic and confirmed states may differ (assuming non-commutative update functions)
    // since the updates were applied in different order.

    // confirm the second expected event
    events.e1.next(customMessage('id_1', 'testEvent', '2'));
    await confirmedSubscriptionCalls[0];
    expect(model.optimistic).toEqual('012');
    expect(model.confirmed).toEqual('02');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(1, null, '02');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(2);

    // confirm the first expected event
    events.e1.next(customMessage('id_1', 'testEvent', '1'));
    await confirmedSubscriptionCalls[1];
    expect(model.optimistic).toEqual('012');
    expect(model.confirmed).toEqual('021');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '021');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(2);
  });

  it<ModelTestContext>('confirms optimistic events from multiple streams', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();

    const events = {
      e1: new Subject<Types.Message>(),
      e2: new Subject<Types.Message>(),
    };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });
    s2.subscribe = vi.fn((callback) => {
      events.e2.subscribe((message) => callback(null, message));
    });

    const model = new Model<string>('test', { ably, logger, sync: async () => ({ version: 1, data: '0' }) });
    await modelStatePromise(model, ModelState.READY);

    // Defines an update function which concatenates strings.
    // This is a non-commutative operation which let's us inspect the order in
    // in which updates are applied to the speculative vs confirmed states.
    const update1 = vi.fn(async (state, event) => state + event.data);
    model.registerUpdate(update1, { channel: 's1', event: 'testEvent' });
    model.registerUpdate(update1, { channel: 's2', event: 'testEvent' });

    const mutation: Mutation = {
      mutate: vi.fn(async () => 'test'),
    };
    model.registerMutation('foo', mutation);

    let optimisticSubscription = new Subject<void>();
    const optimisticSubscriptionSpy = vi.fn<[Error | null | undefined, string | undefined]>(() => {
      optimisticSubscription.next();
    });
    model.subscribe(optimisticSubscriptionSpy);
    const optimisticSubscriptionCall = getNthEventPromise(optimisticSubscription, 3);

    let confirmedSubscription = new Subject<void>();
    const confirmedSubscriptionSpy = vi.fn<[Error | null | undefined, string | undefined]>(() => {
      confirmedSubscription.next();
    });
    model.subscribe(confirmedSubscriptionSpy, { optimistic: false });
    const confirmedSubscriptionCalls = getEventPromises(confirmedSubscription, 3);

    await model.mutate<[string, string], void>('foo', { events: [{ channel: 's1', name: 'testEvent', data: '1' }] });
    await model.mutate<[string, string], void>('foo', { events: [{ channel: 's2', name: 'testEvent', data: '2' }] });
    await model.mutate<[string, string], void>('foo', { events: [{ channel: 's1', name: 'testEvent', data: '3' }] });

    // optimistic updates are applied in the order the mutations were called
    await optimisticSubscriptionCall;
    expect(model.optimistic).toEqual('0123');
    expect(model.confirmed).toEqual('0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(3);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(1, null, '01');
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '012');
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(3, null, '0123');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(0);

    // Optimistic updates must be confirmed in-order only in the context of a single stream,
    // so here we confirm s2 in a different order to the order the mutation were optimistically applied,
    // and assert that the confirmed state is constructed in the correct order (which differs from the
    // order in which the speculative state is constructed).

    // confirm the first expected event
    events.e1.next(customMessage('id_1', 'testEvent', '1'));
    await confirmedSubscriptionCalls[0];
    expect(model.optimistic).toEqual('0123');
    expect(model.confirmed).toEqual('01');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(1, null, '01');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(3); // unchanged

    // confirm the third expected event (second event on the first stream)
    events.e1.next(customMessage('id_2', 'testEvent', '3'));
    await confirmedSubscriptionCalls[1];
    expect(model.optimistic).toEqual('0123');
    expect(model.confirmed).toEqual('013');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '013');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(3); // unchanged

    // confirm the second expected event (first event on the second stream)
    events.e2.next(customMessage('id_1', 'testEvent', '2'));
    await confirmedSubscriptionCalls[2];
    expect(model.optimistic).toEqual('0123');
    expect(model.confirmed).toEqual('0132');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(3);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(3, null, '0132');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(3); // unchanged
  });

  it<ModelTestContext>('rebases optimistic events on top of confirmed state', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const model = new Model<string>('test', { ably, logger, sync: async () => ({ version: 1, data: '0' }) });
    await modelStatePromise(model, ModelState.READY);

    const update1 = vi.fn(async (state, event) => state + event.data);
    model.registerUpdate(update1, { channel: 's1', event: 'testEvent' });

    const mutation: Mutation = {
      mutate: vi.fn(async () => 'test'),
    };
    model.registerMutation('foo', mutation);

    let optimisticSubscription = new Subject<void>();
    const optimisticSubscriptionSpy = vi.fn<[Error | null | undefined, string | undefined]>(() => {
      optimisticSubscription.next();
    });
    model.subscribe(optimisticSubscriptionSpy);
    const optimisticSubscriptionCall = getEventPromises(optimisticSubscription, 3);

    let confirmedSubscription = new Subject<void>();
    const confirmedSubscriptionSpy = vi.fn<[Error | null | undefined, string | undefined]>(() => {
      confirmedSubscription.next();
    });
    model.subscribe(confirmedSubscriptionSpy, { optimistic: false });
    const confirmedSubscriptionCalls = getEventPromises(confirmedSubscription, 3);

    await model.mutate<[string, string], void>('foo', { events: [{ channel: 's1', name: 'testEvent', data: '1' }] });
    await model.mutate<[string, string], void>('foo', { events: [{ channel: 's1', name: 'testEvent', data: '2' }] });

    // optimistic updates are applied in the order the mutations were called
    await optimisticSubscriptionCall[0];
    await optimisticSubscriptionCall[1];
    expect(model.optimistic).toEqual('012');
    expect(model.confirmed).toEqual('0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(1, null, '01');
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '012');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(0);

    // confirm the first expected event
    events.e1.next(customMessage('id_1', 'testEvent', '1'));
    await confirmedSubscriptionCalls[0];
    expect(model.optimistic).toEqual('012');
    expect(model.confirmed).toEqual('01');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(1, null, '01');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(2);

    // an event is received which does not have a corresponding expected event,
    // and the speculative updates are rebased on top of the incoming event
    events.e1.next(customMessage('id_1', 'testEvent', '3'));
    await confirmedSubscriptionCalls[1];
    await optimisticSubscriptionCall[2];
    expect(model.optimistic).toEqual('0132');
    expect(model.confirmed).toEqual('013');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '013');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(3);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(3, null, '0132');

    // confirm the second expected event
    events.e1.next(customMessage('id_1', 'testEvent', '2'));
    await confirmedSubscriptionCalls[2];
    expect(model.optimistic).toEqual('0132');
    expect(model.confirmed).toEqual('0132');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(3);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(3, null, '0132');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(3);
  });

  it<ModelTestContext>('revert optimistic events if mutate fails', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();

    const model = new Model<string>('test', { ably, logger, sync: async () => ({ version: 1, data: '0' }) });
    await modelStatePromise(model, ModelState.READY);

    const update1 = vi.fn(async (state, event) => state + event.data);
    model.registerUpdate(update1, { channel: 's1', event: 'testEvent' });

    const mutation1: Mutation = {
      mutate: vi.fn(async () => 'test'),
    };
    model.registerMutation('mutation1', mutation1);

    const mutation2: Mutation = {
      mutate: vi.fn(async () => {
        throw new Error('test');
      }),
    };
    model.registerMutation('mutation2', mutation2);

    await model.mutate<[], void>('mutation1', {
      events: [
        { channel: 's1', name: 'testEvent', data: '1' },
        { channel: 's1', name: 'testEvent', data: '2' },
        { channel: 's1', name: 'testEvent', data: '3' },
      ],
    });
    await expect(
      model.mutate<[], void>('mutation2', {
        events: [
          { channel: 's1', name: 'testEvent', data: '4' },
          { channel: 's1', name: 'testEvent', data: '5' },
          { channel: 's1', name: 'testEvent', data: '6' },
        ],
      }),
    ).rejects.toThrow('test');
    // The failed mutation should have been reverted.
    expect(model.optimistic).toEqual('0123');
  });

  // Tests if applying a received stream update throws an excection, the
  // model reverts to the PREPARING state and re-syncs.
  it<ModelTestContext>('resync if stream apply update fails', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();

    // event subjects used to invoke the stream subscription callbacks
    // registered by the model, to simulate stream data
    const events = {
      e1: new Subject<Types.Message>(),
      e2: new Subject<Types.Message>(),
    };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });
    s1.unsubscribe = vi.fn();
    s2.subscribe = vi.fn((callback) => {
      events.e2.subscribe((message) => callback(null, message));
    });
    s2.unsubscribe = vi.fn();

    let counter = 0;

    const sync = vi.fn(async () => ({ version: counter + 1, data: String(counter) }));
    const model = new Model<string>('test', { ably, logger, sync });
    await modelStatePromise(model, ModelState.READY);
    expect(sync).toHaveBeenCalledOnce();

    const update1 = vi.fn(async (state, event) => {
      if (event.data === '3') {
        throw new Error('test');
      }
      return event.data;
    });
    model.registerUpdate(update1, { channel: 's1', event: 'testEvent' });

    let subscription = new Subject<void>();
    const subscriptionSpy = vi.fn<[Error | null | undefined, string | undefined]>(() => {
      subscription.next();
    });
    model.subscribe(subscriptionSpy);

    const subscriptionCalls = getEventPromises(subscription, 4);

    events.e1.next(customMessage('id_1', 'testEvent', String(++counter)));
    await subscriptionCalls[0];
    expect(subscriptionSpy).toHaveBeenNthCalledWith(1, null, '1');

    events.e1.next(customMessage('id_2', 'testEvent', String(++counter)));
    await subscriptionCalls[1];
    expect(subscriptionSpy).toHaveBeenNthCalledWith(2, null, '2');

    // The 3rd event throws an exection running apply update, which should
    // trigger a resync and get the latest counter value.
    const preparingPromise = modelStatePromise(model, ModelState.PREPARING);
    events.e1.next(customMessage('id_3', 'testEvent', String(++counter)));
    const { reason } = (await preparingPromise) as ModelStateChange;
    expect(reason.message).toEqual('test');
    await subscriptionCalls[2];
    expect(subscriptionSpy).toHaveBeenNthCalledWith(3, null, '3');
    expect(model.state).toEqual(ModelState.READY);
  });

  // Tests if applying optimistic events throws an exception, mutate fails
  // the the optimistic events are reverted.
  it<ModelTestContext>('revert optimistic events if apply update fails', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();

    const model = new Model<string>('test', { ably, logger, sync: async () => ({ version: 1, data: '0' }) });
    await modelStatePromise(model, ModelState.READY);

    const update1 = vi.fn(async (state, event) => {
      if (event.data === '6') {
        throw new Error('test');
      }
      return state + event.data;
    });
    model.registerUpdate(update1, { channel: 's1', event: 'testEvent' });

    const mutation: Mutation = {
      mutate: vi.fn(async () => 'test'),
    };
    model.registerMutation('mutation', mutation);

    await model.mutate<[], void>('mutation', {
      events: [
        { channel: 's1', name: 'testEvent', data: '1' },
        { channel: 's1', name: 'testEvent', data: '2' },
        { channel: 's1', name: 'testEvent', data: '3' },
      ],
    });
    await expect(
      model.mutate<[], void>('mutation', {
        events: [
          { channel: 's1', name: 'testEvent', data: '4' },
          { channel: 's1', name: 'testEvent', data: '5' },
          { channel: 's1', name: 'testEvent', data: '6' },
        ],
      }),
    ).rejects.toThrow('test');
    // The failed mutation should have been reverted.
    expect(model.optimistic).toEqual('0123');
  });

  it<ModelTestContext>('optimistic event confirmation confirmed before timeout', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const model = new Model<string>('test', { ably, logger, sync: async () => ({ version: 1, data: '0' }) });
    await modelStatePromise(model, ModelState.READY);

    const update1 = vi.fn(async (state, event) => state + event.data);
    model.registerUpdate(update1, { channel: 's1', event: 'testEvent' });

    const mutation: Mutation = {
      mutate: vi.fn(async () => 'test'),
      confirmationTimeout: 1,
    };
    model.registerMutation('foo', mutation);

    const [, confirmationPromise] = await model.mutate<[], void>('foo', {
      events: [
        { channel: 's1', name: 'testEvent', data: '1' },
        { channel: 's1', name: 'testEvent', data: '2' },
        { channel: 's1', name: 'testEvent', data: '3' },
      ],
    });
    expect(model.optimistic).toEqual('0123');
    // Confirm the event.
    events.e1.next(customMessage('id_1', 'testEvent', '1'));
    events.e1.next(customMessage('id_1', 'testEvent', '2'));
    events.e1.next(customMessage('id_1', 'testEvent', '3'));
    await confirmationPromise;

    expect(model.optimistic).toEqual('0123');
  });

  it<ModelTestContext>('optimistic event confirmation timeout', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const model = new Model<string>('test', { ably, logger, sync: async () => ({ version: 1, data: '0' }) });
    await modelStatePromise(model, ModelState.READY);

    const update1 = vi.fn(async (state, event) => state + event.data);
    model.registerUpdate(update1, { channel: 's1', event: 'testEvent' });

    const mutation: Mutation = {
      mutate: vi.fn(async () => 'test'),
      confirmationTimeout: 1,
    };
    model.registerMutation('foo', mutation);

    // Mutate and check the returned promise is rejected with a timeout.
    const [, confirmationPromise] = await model.mutate<[], void>('foo', {
      events: [
        { channel: 's1', name: 'testEvent', data: '1' },
        { channel: 's1', name: 'testEvent', data: '2' },
        { channel: 's1', name: 'testEvent', data: '3' },
      ],
    });
    expect(model.optimistic).toEqual('0123');
    await expect(confirmationPromise).rejects.toThrow('timed out waiting for event confirmation');
    // Check the optimistic event is reverted.
    expect(model.optimistic).toEqual('0');
  });
});
