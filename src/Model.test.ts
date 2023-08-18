import { Realtime, Types } from 'ably/promises';
import pino from 'pino';
import { take } from 'rxjs';
import { Subject, lastValueFrom } from 'rxjs';
import { it, describe, expect, afterEach, vi, beforeEach } from 'vitest';

import Model from './Model.js';
import { StreamOptions, IStream, StreamState } from './Stream.js';
import { IStreamRegistry } from './StreamRegistry.js';
import type { ModelState, ModelStateChange, ModelOptions, Event } from './types/model.d.ts';
import type { MutationMethods, EventComparator } from './types/mutations.d.ts';
import { createMessage, customMessage } from './utilities/test/messages.js';

vi.mock('ably/promises');

// Mocks the StreamRegistry import so that we can modify the Stream instances
// used by the model to spy on their methods.
// This implementation ensures that all instances of StreamRegistry use the
// same cache of Stream instances so that the StreamRegistry instantiated in the
// model returns the same Stream instances as the StreamRegistry instantiated
// in these tests.
vi.mock('./StreamRegistry', () => {
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
    default: class implements IStreamRegistry {
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

const simpleTestData: TestData = {
  foo: 'foobar',
  bar: {
    baz: 1,
  },
};

interface ModelTestContext extends ModelOptions {
  streams: IStreamRegistry;
}

const modelStatePromise = <T, M extends MutationMethods>(model: Model<T, M>, state: ModelState) =>
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
    const { default: provider } = await import('./StreamRegistry.js');
    context.streams = new provider({ ably, logger });
  });

  afterEach<ModelTestContext>(() => {
    vi.restoreAllMocks();
  });

  it<ModelTestContext>('enters ready state after sync', async ({ ably, logger }) => {
    // the promise returned by the subscribe method resolves when we have successfully attached to the channel
    let completeSync: (...args: any[]) => void = () => {
      throw new Error('completeSync not defined');
    };
    const synchronised = new Promise((resolve) => (completeSync = resolve));
    const sync = vi.fn(async () => {
      await synchronised;
      return simpleTestData;
    });
    const model = new Model<TestData, { foo: (val: string) => Promise<number> }>('test', { ably, logger });
    const ready = model.$register({ $sync: sync });
    await modelStatePromise(model, 'preparing');
    completeSync();
    await ready;
    await modelStatePromise(model, 'ready');
    expect(sync).toHaveBeenCalledOnce();
    expect(model.optimistic).toEqual(simpleTestData);
    expect(model.confirmed).toEqual(simpleTestData);
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

    const model = new Model<TestData, {}>('test', { ably, logger });

    // register update function so that streams get created
    await model.$register({
      $sync: sync,
      $update: {
        s1: { event: async (state) => state },
        s2: { event: async (state) => state },
      },
    });

    expect(s1.subscribe).toHaveBeenCalledOnce();
    expect(s2.subscribe).toHaveBeenCalledOnce();

    await model.$pause();
    expect(model.state).toBe('paused');
    expect(s1.pause).toHaveBeenCalledOnce();
    expect(s2.pause).toHaveBeenCalledOnce();

    await model.$resume();
    expect(model.state).toBe('ready');
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

    const model = new Model<TestData, {}>('test', { ably, logger });

    // register update function so that streams get created
    await model.$register({
      $sync: sync,
      $update: {
        s1: { event: async (state) => state },
        s2: { event: async (state) => state },
      },
    });

    expect(sync).toHaveBeenCalledOnce();
    expect(s1.subscribe).toHaveBeenCalledOnce();
    expect(s2.subscribe).toHaveBeenCalledOnce();

    await model.$dispose();
    expect(model.state).toBe('disposed');
    expect(s1.unsubscribe).toHaveBeenCalledOnce();
    expect(s2.unsubscribe).toHaveBeenCalledOnce();
  });

  it<ModelTestContext>('subscribes to updates', async ({ ably, logger, streams }) => {
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

    const sync = vi.fn(async () => 'data_0'); // defines initial version of model
    const model = new Model<string, {}>('test', { ably, logger });

    const update1 = vi.fn(async (state, event) => event.data);
    const update2 = vi.fn(async (state, event) => event.data);
    const update3 = vi.fn(async (state, event) => event.data);
    await model.$register({
      $sync: sync,
      $update: {
        s1: { name_1: update1, name_3: update3 },
        s2: { name_2: update2, name_3: update3 },
      },
    });

    expect(sync).toHaveBeenCalledOnce();

    let subscription = new Subject<void>();
    const subscriptionCalls = getEventPromises(subscription, 5);

    const subscriptionSpy = vi.fn<[Error | null, string?]>(() => subscription.next());
    model.subscribe(subscriptionSpy);

    // initial data
    await subscriptionCalls[0];
    expect(subscriptionSpy).toHaveBeenCalledTimes(1);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(1, null, 'data_0');

    events.e1.next(createMessage(1));
    await subscriptionCalls[1];
    expect(update1).toHaveBeenCalledTimes(1);
    expect(update2).toHaveBeenCalledTimes(0);
    expect(update3).toHaveBeenCalledTimes(0);
    expect(subscriptionSpy).toHaveBeenCalledTimes(2);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_1');

    events.e2.next(createMessage(2));
    await subscriptionCalls[2];
    expect(update1).toHaveBeenCalledTimes(1);
    expect(update2).toHaveBeenCalledTimes(1);
    expect(update3).toHaveBeenCalledTimes(0);
    expect(subscriptionSpy).toHaveBeenCalledTimes(3);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(3, null, 'data_2');

    events.e1.next(createMessage(3));
    await subscriptionCalls[3];
    expect(update1).toHaveBeenCalledTimes(1);
    expect(update2).toHaveBeenCalledTimes(1);
    expect(update3).toHaveBeenCalledTimes(1);
    expect(subscriptionSpy).toHaveBeenCalledTimes(4);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(4, null, 'data_3');

    events.e2.next(createMessage(3));
    await subscriptionCalls[4];
    expect(update1).toHaveBeenCalledTimes(1);
    expect(update2).toHaveBeenCalledTimes(1);
    expect(update3).toHaveBeenCalledTimes(2);
    expect(subscriptionSpy).toHaveBeenCalledTimes(5);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(5, null, 'data_3');

    console.log(model.optimistic, model.confirmed);
    expect(model.optimistic).toEqual('data_3');
    expect(model.confirmed).toEqual('data_3');
  });

  it<ModelTestContext>('subscribes after initialisation', async ({ ably, logger }) => {
    const sync = vi.fn(async () => 'data_0'); // defines initial version of model
    const model = new Model<string, {}>('test', { ably, logger });

    await model.$register({ $sync: sync });

    expect(sync).toHaveBeenCalledOnce();

    // wait for the next event loop iteration so that any scheduled tasks on the tasks queue are cleared,
    // specifically model state updates scheduled via setTimeout from the model init() call in $register()
    await new Promise((resolve) => setTimeout(resolve, 0));

    let subscription = new Subject<void>();
    const subscriptionCall = getNthEventPromise(subscription, 1);

    const subscriptionSpy = vi.fn<[Error | null, string?]>(() => subscription.next());
    model.subscribe(subscriptionSpy);

    // initial data
    await subscriptionCall;
    expect(subscriptionSpy).toHaveBeenCalledTimes(1);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(1, null, 'data_0');
    expect(model.optimistic).toEqual('data_0');
    expect(model.confirmed).toEqual('data_0');
  });

  it<ModelTestContext>('executes a registered mutation', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();
    const model = new Model<string, { foo: (a: string, b: number) => Promise<string> }>('test', { ably, logger });

    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => 'foobar',
      $mutate: { foo: mutation },
    });

    await expect(model.mutations.foo('bar', 123)).resolves.toEqual('test');
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledWith('bar', 123);
  });

  it<ModelTestContext>('fails to register twice', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();
    const model = new Model<string, { foo: () => Promise<void> }>('test', { ably, logger });

    const mutation = vi.fn();
    const sync = async () => 'foobar';
    model.$register({
      $sync: sync,
      $mutate: { foo: mutation },
    });
    expect(() =>
      model.$register({
        $sync: sync,
        $mutate: { foo: mutation },
      }),
    ).toThrow('$register was already called');
  });

  it<ModelTestContext>('fails to register after initialization', async ({ ably, logger, streams }) => {
    // extend the Model class to get access to protected member setState
    class ModelWithSetState<T, M extends MutationMethods> extends Model<T, M> {
      constructor(readonly name: string, options: ModelOptions) {
        super(name, options);
      }
      setState(state: ModelState) {
        super.setState(state);
      }
    }

    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();
    const model = new ModelWithSetState<string, { foo: () => Promise<void> }>('test', { ably, logger });

    const mutation = vi.fn();
    const sync = async () => 'foobar';

    model.setState('ready');

    expect(() => model.$register({ $sync: sync, $mutate: { foo: mutation } })).toThrow(
      `$register can only be called when the model is in the initialized state`,
    );
  });

  it<ModelTestContext>('fails to execute mutation with unregistered stream', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();
    const model = new Model<string, { foo: () => Promise<string> }>('test', { ably, logger });

    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => 'foobar',
      $mutate: { foo: mutation },
    });
    await expect(model.mutations.foo.$expect([{ channel: 'unknown', name: 'foo' }])()).rejects.toThrow(
      "stream with name 'unknown' not registered on model 'test'",
    );
  });

  it<ModelTestContext>('updates model state with optimistic event', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();
    const model = new Model<string, { foo: () => Promise<string> }>('test', { ably, logger });

    const update1 = vi.fn(async (state, event) => event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => 'data_0',
      $update: { s1: { testEvent: update1 } },
      $mutate: { foo: mutation },
    });

    let optimisticSubscription = new Subject<void>();
    const optimisticSubscriptionCalls = getEventPromises(optimisticSubscription, 2);
    const optimisticSubscriptionSpy = vi.fn<[Error | null, string?]>(() => optimisticSubscription.next());
    model.subscribe(optimisticSubscriptionSpy);

    let confirmedSubscription = new Subject<void>();
    const confirmedSubscriptionCalls = getEventPromises(confirmedSubscription, 2);
    const confirmedSubscriptionSpy = vi.fn<[Error | null, string?]>(() => confirmedSubscription.next());
    model.subscribe(confirmedSubscriptionSpy, { optimistic: false });

    await optimisticSubscriptionCalls[0];
    await confirmedSubscriptionCalls[0];
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(1, null, 'data_0');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(1, null, 'data_0');
    expect(model.optimistic).toEqual('data_0');
    expect(model.confirmed).toEqual('data_0');

    await model.mutations.foo.$expect([{ channel: 's1', name: 'testEvent', data: 'data_1' }])();

    await optimisticSubscriptionCalls[1];
    expect(model.optimistic).toEqual('data_1');
    expect(model.confirmed).toEqual('data_0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_1');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);
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

    const model = new Model<string, { foo: () => Promise<string> }>('test', { ably, logger });

    const update1 = vi.fn(async (state, event) => event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => 'data_0',
      $update: { s1: { testEvent: update1 } },
      $mutate: { foo: mutation },
    });

    let optimisticSubscription = new Subject<void>();
    const optimisticSubscriptionCalls = getEventPromises(optimisticSubscription, 2);
    const optimisticSubscriptionSpy = vi.fn<[Error | null, string?]>(() => optimisticSubscription.next());
    model.subscribe(optimisticSubscriptionSpy);

    let confirmedSubscription = new Subject<void>();
    const confirmedSubscriptionCalls = getEventPromises(confirmedSubscription, 2);
    const confirmedSubscriptionSpy = vi.fn<[Error | null, string?]>(() => confirmedSubscription.next());
    model.subscribe(confirmedSubscriptionSpy, { optimistic: false });

    await optimisticSubscriptionCalls[0];
    await confirmedSubscriptionCalls[0];
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(1, null, 'data_0');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(1, null, 'data_0');
    expect(model.optimistic).toEqual('data_0');
    expect(model.confirmed).toEqual('data_0');

    await model.mutations.foo.$expect([{ channel: 's1', name: 'testEvent', data: 'data_1' }])();

    await optimisticSubscriptionCalls[1];
    expect(model.optimistic).toEqual('data_1');
    expect(model.confirmed).toEqual('data_0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_1');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);

    events.e1.next(customMessage('id_1', 'testEvent', 'data_1'));
    await confirmedSubscriptionCalls[1];
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_1');
    expect(model.confirmed).toEqual('data_1');
  });

  it<ModelTestContext>('confirms an optimistic event with a custom comparator', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    s1.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const model = new Model<string, { foo: () => Promise<string> }>('test', { ably, logger });

    const update1 = vi.fn(async (state, event) => event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => 'data_0',
      $update: { s1: { testEvent: update1 } },
      $mutate: { foo: mutation },
    });

    let optimisticSubscription = new Subject<void>();
    const optimisticSubscriptionCalls = getEventPromises(optimisticSubscription, 2);
    const optimisticSubscriptionSpy = vi.fn<[Error | null, string?]>(() => optimisticSubscription.next());
    model.subscribe(optimisticSubscriptionSpy);

    let confirmedSubscription = new Subject<void>();
    const confirmedSubscriptionCalls = getEventPromises(confirmedSubscription, 2);
    const confirmedSubscriptionSpy = vi.fn<[Error | null, string?]>(() => confirmedSubscription.next());
    model.subscribe(confirmedSubscriptionSpy, { optimistic: false });

    await optimisticSubscriptionCalls[0];
    await confirmedSubscriptionCalls[0];
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(1, null, 'data_0');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(1, null, 'data_0');
    expect(model.optimistic).toEqual('data_0');
    expect(model.confirmed).toEqual('data_0');

    const nameOnlyComparator: EventComparator = (optimistic: Event, confirmed: Event) =>
      optimistic.name === confirmed.name;
    await model.mutations.foo.$expect([{ channel: 's1', name: 'testEvent', data: 'data_1' }], nameOnlyComparator)();

    await optimisticSubscriptionCalls[1];
    expect(model.optimistic).toEqual('data_1');
    expect(model.confirmed).toEqual('data_0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_1');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);

    events.e1.next(customMessage('id_1', 'testEvent', 'confirmation'));
    await confirmedSubscriptionCalls[1];
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(2); // unchanged
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(2, null, 'confirmation');
    expect(model.confirmed).toEqual('confirmation');
    expect(model.optimistic).toEqual('confirmation');
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

    const model = new Model<string, { foo: () => Promise<string> }>('test', { ably, logger });

    const update1 = vi.fn(async (state, event) => state + event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => '0',
      $update: { s1: { testEvent: update1 } },
      $mutate: { foo: mutation },
    });

    let optimisticSubscription = new Subject<void>();
    const optimisticSubscriptionCalls = getEventPromises(optimisticSubscription, 4);
    const optimisticSubscriptionSpy = vi.fn<[Error | null, string?]>(() => optimisticSubscription.next());
    model.subscribe(optimisticSubscriptionSpy);

    let confirmedSubscription = new Subject<void>();
    const confirmedSubscriptionCalls = getEventPromises(confirmedSubscription, 3);
    const confirmedSubscriptionSpy = vi.fn<[Error | null, string?]>(() => confirmedSubscription.next());
    model.subscribe(confirmedSubscriptionSpy, { optimistic: false });

    await optimisticSubscriptionCalls[0];
    await confirmedSubscriptionCalls[0];
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(1, null, '0');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(1, null, '0');
    expect(model.optimistic).toEqual('0');
    expect(model.confirmed).toEqual('0');

    await model.mutations.foo.$expect([{ channel: 's1', name: 'testEvent', data: '1' }])();
    await model.mutations.foo.$expect([{ channel: 's1', name: 'testEvent', data: '2' }])();

    // optimistic updates are applied in the order the mutations were called
    await optimisticSubscriptionCalls[1];
    await optimisticSubscriptionCalls[2];
    expect(model.optimistic).toEqual('012');
    expect(model.confirmed).toEqual('0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(3);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '01');
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(3, null, '012');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);

    // You would typically expect the confirmation events to be sent (and arrive) in the
    // same order as their corresponding mutations were applied.
    // However, if this is not the case, we still accept the confirmation, but the
    // optimistic and confirmed states may differ (assuming non-commutative update functions)
    // since the updates were applied in different order.

    // confirm the second expected event
    events.e1.next(customMessage('id_1', 'testEvent', '2'));
    await confirmedSubscriptionCalls[1];
    expect(model.confirmed).toEqual('02');
    await optimisticSubscriptionCalls[3];
    expect(model.optimistic).toEqual('021');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '02');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(4);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(4, null, '021');

    // confirm the first expected event
    events.e1.next(customMessage('id_1', 'testEvent', '1'));
    await confirmedSubscriptionCalls[2];
    expect(model.optimistic).toEqual('021');
    expect(model.confirmed).toEqual('021');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(3);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(3, null, '021');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(4); // unchanged
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

    const model = new Model<string, { foo: () => Promise<string> }>('test', { ably, logger });

    // Defines an update function which concatenates strings.
    // This is a non-commutative operation which let's us inspect the order in
    // in which updates are applied to the speculative vs confirmed states.
    const update1 = vi.fn(async (state, event) => state + event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => '0',
      $update: { s1: { testEvent: update1 }, s2: { testEvent: update1 } },
      $mutate: { foo: mutation },
    });

    let optimisticSubscription = new Subject<void>();
    const optimisticSubscriptionCalls = getEventPromises(optimisticSubscription, 6);
    const optimisticSubscriptionSpy = vi.fn<[Error | null, string?]>(() => optimisticSubscription.next());
    model.subscribe(optimisticSubscriptionSpy);

    let confirmedSubscription = new Subject<void>();
    const confirmedSubscriptionCalls = getEventPromises(confirmedSubscription, 4);
    const confirmedSubscriptionSpy = vi.fn<[Error | null, string?]>(() => confirmedSubscription.next());
    model.subscribe(confirmedSubscriptionSpy, { optimistic: false });

    await optimisticSubscriptionCalls[0];
    await confirmedSubscriptionCalls[0];
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(1, null, '0');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(1, null, '0');
    expect(model.optimistic).toEqual('0');
    expect(model.confirmed).toEqual('0');

    await model.mutations.foo.$expect([{ channel: 's1', name: 'testEvent', data: '1' }])();
    await model.mutations.foo.$expect([{ channel: 's2', name: 'testEvent', data: '2' }])();
    await model.mutations.foo.$expect([{ channel: 's1', name: 'testEvent', data: '3' }])();

    // optimistic updates are applied in the order the mutations were called
    await optimisticSubscriptionCalls[1];
    await optimisticSubscriptionCalls[2];
    await optimisticSubscriptionCalls[3];
    expect(model.optimistic).toEqual('0123');
    expect(model.confirmed).toEqual('0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(4);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '01');
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(3, null, '012');
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(4, null, '0123');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);

    // Optimistic updates must be confirmed in-order only in the context of a single stream,
    // so here we confirm s2 in a different order to the order the mutation were optimistically applied,
    // and assert that the confirmed state is constructed in the correct order (which differs from the
    // order in which the speculative state is constructed).

    // confirm the first expected event
    events.e1.next(customMessage('id_1', 'testEvent', '1'));
    await optimisticSubscriptionCalls[4];
    expect(model.optimistic).toEqual('0123');
    await confirmedSubscriptionCalls[1];
    expect(model.confirmed).toEqual('01');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '01');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(5);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(5, null, '0123');

    // confirm the third expected event (second event on the first stream)
    events.e1.next(customMessage('id_2', 'testEvent', '3'));
    await optimisticSubscriptionCalls[5];
    expect(model.optimistic).toEqual('0132');
    await confirmedSubscriptionCalls[2];
    expect(model.confirmed).toEqual('013');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(3);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(3, null, '013');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(6);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(6, null, '0132');

    // confirm the second expected event (first event on the second stream)
    events.e2.next(customMessage('id_1', 'testEvent', '2'));
    await optimisticSubscriptionCalls[6];
    expect(model.optimistic).toEqual('0132');
    await confirmedSubscriptionCalls[3];
    expect(model.confirmed).toEqual('0132');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(4);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(4, null, '0132');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(6);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(6, null, '0132');
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

    const model = new Model<string, { foo: () => Promise<string> }>('test', { ably, logger });

    const update1 = vi.fn(async (state, event) => state + event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => '0',
      $update: { s1: { testEvent: update1 } },
      $mutate: { foo: mutation },
    });

    let optimisticSubscription = new Subject<void>();
    const optimisticSubscriptionCalls = getEventPromises(optimisticSubscription, 5);
    const optimisticSubscriptionSpy = vi.fn<[Error | null, string?]>(() => optimisticSubscription.next());
    model.subscribe(optimisticSubscriptionSpy);

    let confirmedSubscription = new Subject<void>();
    const confirmedSubscriptionCalls = getEventPromises(confirmedSubscription, 4);
    const confirmedSubscriptionSpy = vi.fn<[Error | null, string?]>(() => confirmedSubscription.next());
    model.subscribe(confirmedSubscriptionSpy, { optimistic: false });

    await optimisticSubscriptionCalls[0];
    await confirmedSubscriptionCalls[0];
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(1, null, '0');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(1, null, '0');
    expect(model.optimistic).toEqual('0');
    expect(model.confirmed).toEqual('0');

    await model.mutations.foo.$expect([{ channel: 's1', name: 'testEvent', data: '1' }])();
    await model.mutations.foo.$expect([{ channel: 's1', name: 'testEvent', data: '2' }])();

    // optimistic updates are applied in the order the mutations were called
    await optimisticSubscriptionCalls[1];
    await optimisticSubscriptionCalls[2];
    expect(model.optimistic).toEqual('012');
    expect(model.confirmed).toEqual('0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(3);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '01');
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(3, null, '012');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);

    // confirm the first expected event
    events.e1.next(customMessage('id_1', 'testEvent', '1'));
    await confirmedSubscriptionCalls[1];
    expect(model.confirmed).toEqual('01');
    await optimisticSubscriptionCalls[3];
    expect(model.optimistic).toEqual('012');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '01');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(4);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(4, null, '012');

    // an event is received which does not have a corresponding expected event,
    // and the speculative updates are rebased on top of the incoming event
    events.e1.next(customMessage('id_1', 'testEvent', '3'));
    await confirmedSubscriptionCalls[2];
    expect(model.confirmed).toEqual('013');
    await optimisticSubscriptionCalls[4];
    expect(model.optimistic).toEqual('0132');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(3);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(3, null, '013');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(5);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(5, null, '0132');

    // confirm the second expected event
    events.e1.next(customMessage('id_1', 'testEvent', '2'));
    await confirmedSubscriptionCalls[3];
    expect(model.confirmed).toEqual('0132');
    await optimisticSubscriptionCalls[5];
    expect(model.optimistic).toEqual('0132');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(4);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(4, null, '0132');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(5);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(5, null, '0132');
  });

  it<ModelTestContext>('revert optimistic events if mutate fails', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();

    const model = new Model<
      string,
      {
        mutation1: () => Promise<string>;
        mutation2: () => Promise<string>;
      }
    >('test', { ably, logger });

    const update1 = vi.fn(async (state, event) => state + event.data);
    const mutation1 = vi.fn(async () => 'test');
    const mutation2 = vi.fn(async () => {
      throw new Error('mutation failed');
    });

    await model.$register({
      $sync: async () => '0',
      $update: { s1: { testEvent: update1 } },
      $mutate: { mutation1, mutation2 },
    });

    const result1 = await model.mutations.mutation1.$expect([
      { channel: 's1', name: 'testEvent', data: '1' },
      { channel: 's1', name: 'testEvent', data: '2' },
      { channel: 's1', name: 'testEvent', data: '3' },
    ])();
    expect(result1[0]).toEqual('test');
    await expect(
      model.mutations.mutation2.$expect([
        { channel: 's1', name: 'testEvent', data: '4' },
        { channel: 's1', name: 'testEvent', data: '5' },
        { channel: 's1', name: 'testEvent', data: '6' },
      ])(),
    ).rejects.toThrow('mutation failed');
    expect(model.optimistic).toEqual('0123');
  });

  // If applying a received stream update throws, the model reverts to the PREPARING state and re-syncs.
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

    const sync = vi.fn(async () => `${counter}`);
    const model = new Model<string, {}>('test', { ably, logger });

    const update1 = vi.fn(async (state, event) => {
      if (event.data === '3') {
        throw new Error('test');
      }
      return event.data;
    });
    await model.$register({ $sync: sync, $update: { s1: { testEvent: update1 } } });

    expect(sync).toHaveBeenCalledOnce();

    let subscription = new Subject<void>();
    const subscriptionCalls = getEventPromises(subscription, 5);
    const subscriptionSpy = vi.fn<[Error | null, string?]>(() => {
      subscription.next();
    });
    model.subscribe(subscriptionSpy);

    await subscriptionCalls[0];
    expect(subscriptionSpy).toHaveBeenNthCalledWith(1, null, '0');

    events.e1.next(customMessage('id_1', 'testEvent', String(++counter)));
    await subscriptionCalls[1];
    expect(subscriptionSpy).toHaveBeenNthCalledWith(2, null, '1');

    events.e1.next(customMessage('id_2', 'testEvent', String(++counter)));
    await subscriptionCalls[2];
    expect(subscriptionSpy).toHaveBeenNthCalledWith(3, null, '2');

    // The 3rd event throws when applying the update, which should
    // trigger a resync and get the latest counter value.
    const preparingPromise = modelStatePromise(model, 'preparing');
    events.e1.next(customMessage('id_3', 'testEvent', String(++counter)));
    const { reason } = (await preparingPromise) as ModelStateChange;
    expect(reason).to.toBeDefined();
    expect(reason!.message).toEqual('test');
    await subscriptionCalls[3];
    expect(subscriptionSpy).toHaveBeenNthCalledWith(4, null, '3');
    expect(model.state).toEqual('ready');
  });

  // Tests if applying optimistic events throws, the the optimistic events are reverted.
  it<ModelTestContext>('revert optimistic events if apply update fails', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();

    const model = new Model<string, { mutation: () => Promise<string> }>('test', { ably, logger });

    const updateFn = vi.fn(async (state, event) => {
      if (event.data === '6') {
        throw new Error('update error');
      }
      return state + event.data;
    });
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => '0',
      $update: { s1: { testEvent: updateFn } },
      $mutate: { mutation },
    });
    const [result1] = await model.mutations.mutation.$expect([
      { channel: 's1', name: 'testEvent', data: '1' },
      { channel: 's1', name: 'testEvent', data: '2' },
      { channel: 's1', name: 'testEvent', data: '3' },
    ])();
    expect(result1).toEqual('test');
    await expect(
      model.mutations.mutation.$expect([
        { channel: 's1', name: 'testEvent', data: '4' },
        { channel: 's1', name: 'testEvent', data: '5' },
        { channel: 's1', name: 'testEvent', data: '6' },
      ])(),
    ).rejects.toThrow('update error');
    // The failed mutation should have been reverted.
    expect(model.optimistic).toEqual('0123');
  });

  // Tests if the mutation throws, the the optimistic events are reverted.
  it<ModelTestContext>('revert optimistic events if mutation fails', async ({ ably, logger, streams }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    const s2 = streams.getOrCreate({ channel: 's2' });
    s1.subscribe = vi.fn();
    s2.subscribe = vi.fn();

    const model = new Model<string, { mutation1: () => Promise<string>; mutation2: () => Promise<string> }>('test', {
      ably,
      logger,
    });

    const updateFn = vi.fn(async (state, event) => state + event.data);
    const mutation1 = vi.fn(async () => 'test');
    const mutation2 = async () => {
      throw new Error('mutation failed');
    };
    await model.$register({
      $sync: async () => '0',
      $update: { s1: { testEvent: updateFn } },
      $mutate: { mutation1, mutation2 },
    });
    const [result1] = await model.mutations.mutation1.$expect([
      { channel: 's1', name: 'testEvent', data: '1' },
      { channel: 's1', name: 'testEvent', data: '2' },
      { channel: 's1', name: 'testEvent', data: '3' },
    ])();
    expect(result1).toEqual('test');
    await expect(
      model.mutations.mutation2.$expect([
        { channel: 's1', name: 'testEvent', data: '4' },
        { channel: 's1', name: 'testEvent', data: '5' },
        { channel: 's1', name: 'testEvent', data: '6' },
      ])(),
    ).rejects.toThrow('mutation failed');
    // The failed mutation should have been reverted.
    expect(model.optimistic).toEqual('0123');
  });

  // Tests if applying optimistic events throws *and* the mutation throws, the the optimistic events are reverted.
  it<ModelTestContext>('revert optimistic events if the mutation fails and apply update fails', async ({
    ably,
    logger,
    streams,
  }) => {
    const s1 = streams.getOrCreate({ channel: 's1' });
    s1.subscribe = vi.fn();

    const model = new Model<string, { mutation: () => Promise<string> }>('test', { ably, logger });

    const update1 = async (state, event) => {
      if (event.data === '3') {
        throw new Error('update error');
      }
      return state + event.data;
    };
    const mutation = async () => {
      throw new Error('mutation failed');
    };
    await model.$register({
      $sync: async () => '0',
      $update: { s1: { testEvent: update1 } },
      $mutate: { mutation },
    });
    await expect(
      model.mutations.mutation.$expect([
        { channel: 's1', name: 'testEvent', data: '1' },
        { channel: 's1', name: 'testEvent', data: '2' },
        { channel: 's1', name: 'testEvent', data: '3' },
      ])(),
    ).rejects.toThrow(new Error('update error')); // mutation not invoked if optimistic update fails, so we only expect an update error
    // The failed mutation should have been reverted.
    expect(model.optimistic).toEqual('0');
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

    const model = new Model<string, { foo: () => Promise<string> }>('test', { ably, logger });

    const update1 = vi.fn(async (state, event) => state + event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => '0',
      $update: { s1: { testEvent: update1 } },
      $mutate: {
        foo: {
          func: mutation,
          options: { timeout: 1000 },
        },
      },
    });
    const [result, confirmation] = await model.mutations.foo.$expect([
      { channel: 's1', name: 'testEvent', data: '1' },
      { channel: 's1', name: 'testEvent', data: '2' },
      { channel: 's1', name: 'testEvent', data: '3' },
    ])();
    expect(result).toEqual('test');
    expect(model.optimistic).toEqual('0123');

    // Confirm the event.
    events.e1.next(customMessage('id_1', 'testEvent', '1'));
    events.e1.next(customMessage('id_1', 'testEvent', '2'));
    events.e1.next(customMessage('id_1', 'testEvent', '3'));
    await confirmation;
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

    const model = new Model<string, { foo: () => Promise<string> }>('test', { ably, logger });

    const update1 = vi.fn(async (state, event) => state + event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => '0',
      $update: { s1: { testEvent: update1 } },
      $mutate: {
        foo: {
          func: mutation,
          options: { timeout: 1 },
        },
      },
    });

    // Mutate and check the returned promise is rejected with a timeout.
    const [, confirmation] = await model.mutations.foo.$expect([
      { channel: 's1', name: 'testEvent', data: '1' },
      { channel: 's1', name: 'testEvent', data: '2' },
      { channel: 's1', name: 'testEvent', data: '3' },
    ])();
    expect(model.optimistic).toEqual('0123');
    await expect(confirmation).rejects.toThrow('timed out waiting for event confirmation');
    // Check the optimistic event is reverted.
    expect(model.optimistic).toEqual('0');
  });
});
