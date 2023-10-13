import { Realtime, Types } from 'ably/promises';
import pino from 'pino';
import { take } from 'rxjs';
import { Subject, lastValueFrom } from 'rxjs';
import { it, describe, expect, afterEach, vi, beforeEach } from 'vitest';

import Model from './Model.js';
import { StreamOptions, IStream, StreamState } from './Stream.js';
import { IStreamFactory } from './StreamFactory.js';
import type { ModelState, ModelStateChange, ModelOptions, Event } from './types/model.d.ts';
import type { MutationMethods, EventComparator, MutationContext } from './types/mutations.d.ts';
import { createMessage, customMessage } from './utilities/test/messages.js';

vi.mock('ably/promises');

// Mocks the StreamFactory import so that we can modify the Stream instances
// used by the model to spy on their methods.
// This implementation ensures that all instances of StreamFactory use the
// same cache of Stream instances so that the StreamFactory instantiated in the
// model returns the same Stream instances as the StreamFactory instantiated
// in these tests.
vi.mock('./StreamFactory', () => {
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
    async reset() {}
  }

  const streams: { [key: string]: IStream } = {};

  return {
    default: class implements IStreamFactory {
      newStream(options: Pick<StreamOptions, 'channel'>) {
        if (!streams[options.channel]) {
          streams[options.channel] = new MockStream(options);
        }
        return streams[options.channel];
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
  streams: IStreamFactory;
  channelName: string;
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
    const { default: provider } = await import('./StreamFactory.js');
    context.streams = new provider({ ably, logger });
    context.channelName = 'models:myModelTest:events';
  });

  afterEach<ModelTestContext>(() => {
    vi.restoreAllMocks();
  });

  it<ModelTestContext>('enters ready state after sync', async ({ channelName, ably, logger }) => {
    // the promise returned by the subscribe method resolves when we have successfully attached to the channel
    let completeSync: (...args: any[]) => void = () => {
      throw new Error('completeSync not defined');
    };
    const synchronised = new Promise((resolve) => (completeSync = resolve));
    const sync = vi.fn(async () => {
      await synchronised;
      return simpleTestData;
    });
    const model = new Model<TestData, { foo: (_: MutationContext, val: string) => Promise<number> }>(
      'test',
      channelName,
      {
        ably,
        logger,
      },
    );
    const ready = model.$register({ $sync: sync });
    await modelStatePromise(model, 'preparing');
    completeSync();
    await ready;
    await modelStatePromise(model, 'ready');
    expect(sync).toHaveBeenCalledOnce();
    expect(model.optimistic).toEqual(simpleTestData);
    expect(model.confirmed).toEqual(simpleTestData);
  });

  it<ModelTestContext>('pauses and resumes the model', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();
    s1.pause = vi.fn();
    s1.resume = vi.fn();
    const sync = vi.fn(async () => simpleTestData);

    const model = new Model<TestData, {}>('test', channelName, { ably, logger });

    // register update function so that streams get created
    await model.$register({
      $sync: sync,
      $merge: async (state) => state,
    });

    expect(s1.subscribe).toHaveBeenCalledOnce();

    await model.$pause();
    expect(model.state).toBe('paused');
    expect(s1.pause).toHaveBeenCalledOnce();

    await model.$resume();
    expect(model.state).toBe('ready');
    expect(s1.resume).toHaveBeenCalledOnce();
  });

  it<ModelTestContext>('disposes of the model', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();
    s1.unsubscribe = vi.fn();
    const sync = vi.fn(async () => simpleTestData);

    const model = new Model<TestData, {}>('test', channelName, { ably, logger });

    // register update function so that streams get created
    await model.$register({
      $sync: sync,
      $merge: async (state) => state,
    });

    expect(sync).toHaveBeenCalledOnce();
    expect(s1.subscribe).toHaveBeenCalledOnce();

    await model.$dispose();
    expect(model.state).toBe('disposed');
    expect(s1.unsubscribe).toHaveBeenCalledOnce();
  });

  it<ModelTestContext>('subscribes to updates', async ({ channelName, ably, logger, streams }) => {
    const events = {
      channelEvents: new Subject<Types.Message>(),
    };

    streams.newStream({ channel: channelName }).subscribe = vi.fn((callback) =>
      events.channelEvents.subscribe((message) => callback(null, message)),
    );

    const sync = vi.fn(async () => 'data_0'); // defines initial version of model
    const model = new Model<string, {}>('test', channelName, { ably, logger });

    const mergeFn = vi.fn(async (state, event) => event.data);
    await model.$register({
      $sync: sync,
      $merge: mergeFn,
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

    events.channelEvents.next(createMessage(1));
    await subscriptionCalls[1];
    expect(mergeFn).toHaveBeenCalledTimes(1);
    expect(subscriptionSpy).toHaveBeenCalledTimes(2);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_1');

    events.channelEvents.next(createMessage(2));
    await subscriptionCalls[2];
    expect(mergeFn).toHaveBeenCalledTimes(2);
    expect(subscriptionSpy).toHaveBeenCalledTimes(3);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(3, null, 'data_2');

    events.channelEvents.next(createMessage(3));
    await subscriptionCalls[3];
    expect(mergeFn).toHaveBeenCalledTimes(3);
    expect(subscriptionSpy).toHaveBeenCalledTimes(4);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(4, null, 'data_3');

    events.channelEvents.next(createMessage(3));
    await subscriptionCalls[4];
    expect(mergeFn).toHaveBeenCalledTimes(4);
    expect(subscriptionSpy).toHaveBeenCalledTimes(5);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(5, null, 'data_3');

    expect(model.optimistic).toEqual('data_3');
    expect(model.confirmed).toEqual('data_3');
  });

  it<ModelTestContext>('subscribes after initialisation', async ({ channelName, ably, logger }) => {
    const sync = vi.fn(async () => 'data_0'); // defines initial version of model
    const model = new Model<string, {}>('test', channelName, { ably, logger });

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

  it<ModelTestContext>('executes a registered mutation', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();
    const model = new Model<string, { foo: (_: MutationContext, a: string, b: number) => Promise<string> }>(
      'test',
      channelName,
      {
        ably,
        logger,
      },
    );

    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => 'foobar',
      $mutate: { foo: mutation },
    });

    await expect(model.mutations.foo('bar', 123)).resolves.toEqual('test');
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledWith({ events: [] }, 'bar', 123);
  });

  it<ModelTestContext>('fails to register twice', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();
    const model = new Model<string, { foo: () => Promise<void> }>('test', channelName, { ably, logger });

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

  it<ModelTestContext>('fails to register after initialization', async ({ channelName, ably, logger, streams }) => {
    // extend the Model class to get access to protected member setState
    class ModelWithSetState<T, M extends MutationMethods> extends Model<T, M> {
      constructor(readonly name: string, channelName: string, options: ModelOptions) {
        super(name, channelName, options);
      }
      setState(state: ModelState) {
        super.setState(state);
      }
    }

    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();
    const model = new ModelWithSetState<string, { foo: () => Promise<void> }>('test', channelName, { ably, logger });

    const mutation = vi.fn();
    const sync = async () => 'foobar';

    model.setState('ready');

    expect(() => model.$register({ $sync: sync, $mutate: { foo: mutation } })).toThrow(
      `$register can only be called when the model is in the initialized state`,
    );
  });

  it<ModelTestContext>('fails to execute mutation with unregistered stream', async ({
    channelName,
    ably,
    logger,
    streams,
  }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();
    const model = new Model<string, { foo: () => Promise<string> }>('test', channelName, { ably, logger });

    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => 'foobar',
      $mutate: { foo: mutation },
    });
    await expect(model.mutations.foo.$expect({ events: [{ channel: 'unknown', name: 'foo' }] })()).rejects.toThrow(
      "stream with name 'unknown' not registered on model 'test'",
    );
  });

  it<ModelTestContext>('updates model state with optimistic event', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();
    const model = new Model<string, { foo: () => Promise<string> }>('test', channelName, { ably, logger });

    const mergeFn = vi.fn(async (state, event) => event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => 'data_0',
      $merge: mergeFn,
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

    await model.mutations.foo.$expect({ events: [{ channel: channelName, name: 'testEvent', data: 'data_1' }] })();

    await optimisticSubscriptionCalls[1];
    expect(model.optimistic).toEqual('data_1');
    expect(model.confirmed).toEqual('data_0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_1');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);
  });

  it<ModelTestContext>('confirms an optimistic event', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const model = new Model<string, { foo: () => Promise<string> }>('test', channelName, { ably, logger });

    const mergeFn = vi.fn(async (state, event) => event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => 'data_0',
      $merge: mergeFn,
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

    await model.mutations.foo.$expect({ events: [{ channel: channelName, name: 'testEvent', data: 'data_1' }] })();

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

  it<ModelTestContext>('confirms an optimistic event by uuid', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const model = new Model<string, { foo: () => Promise<string> }>('test', channelName, { ably, logger });

    const mergeFn = vi.fn(async (state, event) => event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => 'data_0',
      $merge: mergeFn,
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

    await model.mutations.foo.$expect({
      events: [{ uuid: 'some-custom-id', channel: channelName, name: 'testEvent', data: 'data_1' }],
    })();

    await optimisticSubscriptionCalls[1];
    expect(model.optimistic).toEqual('data_1');
    expect(model.confirmed).toEqual('data_0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_1');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);

    // the event data payload does not match the expected event but the uuid does
    events.e1.next(
      customMessage('id_1', 'testEvent', 'confirmed_data', { 'x-ably-models-event-uuid': 'some-custom-id' }),
    );
    await confirmedSubscriptionCalls[1];
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(2, null, 'confirmed_data');
    expect(model.confirmed).toEqual('confirmed_data');
  });

  it<ModelTestContext>('mutation can access the optimistic events', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const model = new Model<
      string,
      { foo: (context: MutationContext, arg: string) => Promise<{ context?: string; arg: string }> }
    >('test', channelName, { ably, logger });

    const mergeFn = vi.fn(async (state, event) => event.data);
    const mutation = vi.fn(async function (context: MutationContext, arg: string) {
      if (!context.events.length) {
        return { arg };
      }
      return {
        context: context.events[0].name,
        arg,
      };
    });
    await model.$register({
      $sync: async () => 'data_0',
      $merge: mergeFn,
      $mutate: { foo: mutation },
    });

    const result1 = await model.mutations.foo('arg');
    expect(result1).toEqual({ arg: 'arg' });

    const [result2] = await model.mutations.foo.$expect({
      events: [{ channel: channelName, name: 'context', data: 'data_1' }],
    })('arg');
    expect(result2).toEqual({ context: 'context', arg: 'arg' });
  });

  it<ModelTestContext>('explicitly rejects an optimistic event', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const model = new Model<string, { foo: () => Promise<string> }>('test', channelName, { ably, logger });

    const mergeFn = vi.fn(async (state, event) => event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => 'data_0',
      $merge: mergeFn,
      $mutate: { foo: mutation },
    });

    let optimisticSubscription = new Subject<void>();
    const optimisticSubscriptionCalls = getEventPromises(optimisticSubscription, 3);
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

    const [result, confirmation] = await model.mutations.foo.$expect({
      events: [{ channel: channelName, name: 'testEvent', data: 'data_1' }],
    })();
    expect(result).toEqual('test');

    await optimisticSubscriptionCalls[1];
    expect(model.optimistic).toEqual('data_1');
    expect(model.confirmed).toEqual('data_0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_1');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);

    events.e1.next(customMessage('id_1', 'testEvent', 'data_1', { 'x-ably-models-reject': 'true' }));
    await expect(confirmation).rejects.toThrow(`events contain rejections: channel:${channelName} name:testEvent`);
    await optimisticSubscriptionCalls[2];
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(3);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(3, null, 'data_0');
    expect(model.optimistic).toEqual('data_0');
    expect(model.confirmed).toEqual('data_0');
  });

  it<ModelTestContext>('confirms an optimistic event with a custom comparator', async ({
    channelName,
    ably,
    logger,
    streams,
  }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const model = new Model<string, { foo: () => Promise<string> }>('test', channelName, { ably, logger });

    const nameOnlyComparator: EventComparator = (optimistic: Event, confirmed: Event) =>
      optimistic.name === confirmed.name;
    const mergeFn = vi.fn(async (state, event) => event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => 'data_0',
      $merge: mergeFn,
      $mutate: {
        foo: {
          func: mutation,
          options: { comparator: nameOnlyComparator },
        },
      },
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

    await model.mutations.foo.$expect({ events: [{ channel: channelName, name: 'testEvent', data: 'data_1' }] })();

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

  it<ModelTestContext>('confirms optimistic events out of order', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const model = new Model<string, { foo: () => Promise<string> }>('test', channelName, { ably, logger });

    const mergeFn = vi.fn(async (state, event) => state + event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => '0',
      $merge: mergeFn,
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

    await model.mutations.foo.$expect({ events: [{ channel: channelName, name: 'testEvent', data: '1' }] })();
    await model.mutations.foo.$expect({ events: [{ channel: channelName, name: 'testEvent', data: '2' }] })();

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

  it<ModelTestContext>('rebases optimistic events on top of confirmed state', async ({
    channelName,
    ably,
    logger,
    streams,
  }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const model = new Model<string, { foo: () => Promise<string> }>('test', channelName, { ably, logger });

    const mergeFn = vi.fn(async (state, event) => state + event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => '0',
      $merge: mergeFn,
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

    await model.mutations.foo.$expect({ events: [{ channel: channelName, name: 'testEvent', data: '1' }] })();
    await model.mutations.foo.$expect({ events: [{ channel: channelName, name: 'testEvent', data: '2' }] })();

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

  it<ModelTestContext>('revert optimistic events if mutate fails', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();

    const model = new Model<
      string,
      {
        mutation1: () => Promise<string>;
        mutation2: () => Promise<string>;
      }
    >('test', channelName, { ably, logger });

    const mergeFn = vi.fn(async (state, event) => state + event.data);
    const mutation1 = vi.fn(async () => 'test');
    const mutation2 = vi.fn(async () => {
      throw new Error('mutation failed');
    });

    await model.$register({
      $sync: async () => '0',
      $merge: mergeFn,
      $mutate: { mutation1, mutation2 },
    });

    const result1 = await model.mutations.mutation1.$expect({
      events: [
        { channel: channelName, name: 'testEvent', data: '1' },
        { channel: channelName, name: 'testEvent', data: '2' },
        { channel: channelName, name: 'testEvent', data: '3' },
      ],
    })();
    expect(result1[0]).toEqual('test');
    await expect(
      model.mutations.mutation2.$expect({
        events: [
          { channel: channelName, name: 'testEvent', data: '4' },
          { channel: channelName, name: 'testEvent', data: '5' },
          { channel: channelName, name: 'testEvent', data: '6' },
        ],
      })(),
    ).rejects.toThrow('mutation failed');
    expect(model.optimistic).toEqual('0123');
  });

  // If applying a received stream update throws, the model reverts to the PREPARING state and re-syncs.
  it<ModelTestContext>('resync if stream apply update fails', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();

    // event subjects used to invoke the stream subscription callbacks
    // registered by the model, to simulate stream data
    const events = {
      channelEvents: new Subject<Types.Message>(),
    };
    s1.subscribe = vi.fn((callback) => {
      events.channelEvents.subscribe((message) => callback(null, message));
    });
    s1.unsubscribe = vi.fn();

    let counter = 0;

    const sync = vi.fn(async () => `${counter}`);
    const model = new Model<string, {}>('test', channelName, { ably, logger });

    const mergeFn = vi.fn(async (state, event) => {
      if (event.data === '3') {
        throw new Error('test');
      }
      return event.data;
    });
    await model.$register({ $sync: sync, $merge: mergeFn });

    expect(sync).toHaveBeenCalledOnce();

    let subscription = new Subject<void>();
    const subscriptionCalls = getEventPromises(subscription, 5);
    const subscriptionSpy = vi.fn<[Error | null, string?]>(() => {
      subscription.next();
    });
    model.subscribe(subscriptionSpy);

    await subscriptionCalls[0];
    expect(subscriptionSpy).toHaveBeenNthCalledWith(1, null, '0');

    events.channelEvents.next(customMessage('id_1', 'testEvent', String(++counter)));
    await subscriptionCalls[1];
    expect(subscriptionSpy).toHaveBeenNthCalledWith(2, null, '1');
    expect(mergeFn).toHaveBeenCalledTimes(1);

    events.channelEvents.next(customMessage('id_2', 'testEvent', String(++counter)));
    await subscriptionCalls[2];
    expect(subscriptionSpy).toHaveBeenNthCalledWith(3, null, '2');
    expect(mergeFn).toHaveBeenCalledTimes(2);

    // The 3rd event throws when applying the update, which should
    // trigger a resync and get the latest counter value.
    const preparingPromise = modelStatePromise(model, 'preparing');
    events.channelEvents.next(customMessage('id_3', 'testEvent', String(++counter)));
    const { reason } = (await preparingPromise) as ModelStateChange;
    expect(reason).to.toBeDefined();
    expect(reason!.message).toEqual('test');
    await subscriptionCalls[3];
    expect(subscriptionSpy).toHaveBeenNthCalledWith(4, null, '3');
    expect(mergeFn).toHaveBeenCalledTimes(3);
    expect(model.state).toEqual('ready');
  });

  // Tests if applying optimistic events throws, the the optimistic events are reverted.
  it<ModelTestContext>('revert optimistic events if apply update fails', async ({
    channelName,
    ably,
    logger,
    streams,
  }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();

    const model = new Model<string, { mutation: () => Promise<string> }>('test', channelName, { ably, logger });

    const mergeFn = vi.fn(async (state, event) => {
      if (event.data === '6') {
        throw new Error('update error');
      }
      return state + event.data;
    });
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => '0',
      $merge: mergeFn,
      $mutate: { mutation },
    });
    const [result1] = await model.mutations.mutation.$expect({
      events: [
        { channel: channelName, name: 'testEvent', data: '1' },
        { channel: channelName, name: 'testEvent', data: '2' },
        { channel: channelName, name: 'testEvent', data: '3' },
      ],
    })();
    expect(result1).toEqual('test');
    await expect(
      model.mutations.mutation.$expect({
        events: [
          { channel: channelName, name: 'testEvent', data: '4' },
          { channel: channelName, name: 'testEvent', data: '5' },
          { channel: channelName, name: 'testEvent', data: '6' },
        ],
      })(),
    ).rejects.toThrow('update error');
    // The failed mutation should have been reverted.
    expect(model.optimistic).toEqual('0123');
  });

  // Tests if the mutation throws, the the optimistic events are reverted.
  it<ModelTestContext>('revert optimistic events if mutation fails', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channel: 's1' });
    s1.subscribe = vi.fn();

    const model = new Model<string, { mutation1: () => Promise<string>; mutation2: () => Promise<string> }>(
      'test',
      channelName,
      {
        ably,
        logger,
      },
    );

    const mergeFn = vi.fn(async (state, event) => state + event.data);
    const mutation1 = vi.fn(async () => 'test');
    const mutation2 = async () => {
      throw new Error('mutation failed');
    };
    await model.$register({
      $sync: async () => '0',
      $merge: mergeFn,
      $mutate: { mutation1, mutation2 },
    });
    const [result1] = await model.mutations.mutation1.$expect({
      events: [
        { channel: channelName, name: 'testEvent', data: '1' },
        { channel: channelName, name: 'testEvent', data: '2' },
        { channel: channelName, name: 'testEvent', data: '3' },
      ],
    })();
    expect(result1).toEqual('test');
    await expect(
      model.mutations.mutation2.$expect({
        events: [
          { channel: channelName, name: 'testEvent', data: '4' },
          { channel: channelName, name: 'testEvent', data: '5' },
          { channel: channelName, name: 'testEvent', data: '6' },
        ],
      })(),
    ).rejects.toThrow('mutation failed');
    // The failed mutation should have been reverted.
    expect(model.optimistic).toEqual('0123');
  });

  // Tests if applying optimistic events throws *and* the mutation throws, the the optimistic events are reverted.
  it<ModelTestContext>('revert optimistic events if the mutation fails and apply update fails', async ({
    channelName,
    ably,
    logger,
    streams,
  }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();

    const model = new Model<string, { mutation: () => Promise<string> }>('test', channelName, { ably, logger });

    const mergeFn = async (state, event) => {
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
      $merge: mergeFn,
      $mutate: { mutation },
    });
    await expect(
      model.mutations.mutation.$expect({
        events: [
          { channel: channelName, name: 'testEvent', data: '1' },
          { channel: channelName, name: 'testEvent', data: '2' },
          { channel: channelName, name: 'testEvent', data: '3' },
        ],
      })(),
    ).rejects.toThrow(new Error('update error')); // mutation not invoked if optimistic update fails, so we only expect an update error
    // The failed mutation should have been reverted.
    expect(model.optimistic).toEqual('0');
  });

  it<ModelTestContext>('optimistic event confirmation confirmed before timeout', async ({
    channelName,
    ably,
    logger,
    streams,
  }) => {
    const s1 = streams.newStream({ channel: channelName });
    s1.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const model = new Model<string, { foo: () => Promise<string> }>('test', channelName, { ably, logger });

    const mergeFn = vi.fn(async (state, event) => state + event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => '0',
      $merge: mergeFn,
      $mutate: {
        foo: {
          func: mutation,
          options: { timeout: 1000 },
        },
      },
    });
    const [result, confirmation] = await model.mutations.foo.$expect({
      events: [
        { channel: channelName, name: 'testEvent', data: '1' },
        { channel: channelName, name: 'testEvent', data: '2' },
        { channel: channelName, name: 'testEvent', data: '3' },
      ],
    })();
    expect(result).toEqual('test');
    expect(model.optimistic).toEqual('0123');

    // Confirm the event.
    events.e1.next(customMessage('id_1', 'testEvent', '1'));
    events.e1.next(customMessage('id_1', 'testEvent', '2'));
    events.e1.next(customMessage('id_1', 'testEvent', '3'));
    await confirmation;
    expect(model.optimistic).toEqual('0123');
  });

  it<ModelTestContext>('optimistic event confirmation timeout', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channel: 's1' });
    s1.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const model = new Model<string, { foo: () => Promise<string> }>('test', channelName, { ably, logger });

    const mergeFn = vi.fn(async (state, event) => state + event.data);
    const mutation = vi.fn(async () => 'test');
    await model.$register({
      $sync: async () => '0',
      $merge: mergeFn,
      $mutate: {
        foo: {
          func: mutation,
          options: { timeout: 1 },
        },
      },
    });

    // Mutate and check the returned promise is rejected with a timeout.
    const [, confirmation] = await model.mutations.foo.$expect({
      events: [
        { channel: channelName, name: 'testEvent', data: '1' },
        { channel: channelName, name: 'testEvent', data: '2' },
        { channel: channelName, name: 'testEvent', data: '3' },
      ],
    })();
    expect(model.optimistic).toEqual('0123');
    await expect(confirmation).rejects.toThrow('timed out waiting for event confirmation');
    // Check the optimistic event is reverted.
    expect(model.optimistic).toEqual('0');
  });
});
