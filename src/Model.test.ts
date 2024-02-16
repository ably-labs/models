import { Realtime, Types } from 'ably/promises';
import pino from 'pino';
import { Subject } from 'rxjs';
import { it, describe, expect, afterEach, vi, beforeEach } from 'vitest';

import Model from './Model.js';
import { defaultSyncOptions, defaultEventBufferOptions, defaultOptimisticEventOptions } from './Options.js';
import { IStream } from './stream/Stream.js';
import { IStreamFactory } from './stream/StreamFactory.js';
import type { ModelStateChange, ModelOptions, SyncFuncConstraint } from './types/model.d.ts';
import type { StreamOptions, StreamState } from './types/stream.js';
import { EventListener } from './utilities/EventEmitter.js';
import { statePromise, timeout } from './utilities/promises.js';
import { fixedRetryStrategy } from './utilities/retries.js';
import { createMessage, customMessage } from './utilities/test/messages.js';
import { getNthEventPromise, getEventPromises } from './utilities/test/promises.js';

vi.mock('ably/promises');

// Mocks the StreamFactory import so that we can modify the Stream instances
// used by the model to spy on their methods.
// This implementation ensures that all instances of StreamFactory use the
// same cache of Stream instances so that the StreamFactory instantiated in the
// model returns the same Stream instances as the StreamFactory instantiated
// in these tests.
vi.mock('./stream/StreamFactory', () => {
  class MockStream implements IStream {
    constructor(readonly options: Pick<StreamOptions, 'channelName'>) {}
    get state(): StreamState {
      return 'ready';
    }
    get channelName() {
      return this.options.channelName;
    }
    async reset() {}
    async subscribe() {}
    unsubscribe(): void {}
    async dispose() {}
    async replay() {}
  }

  const streams: { [key: string]: IStream } = {};

  return {
    default: class implements IStreamFactory {
      newStream(options: Pick<StreamOptions, 'channelName'>) {
        if (!streams[options.channelName]) {
          streams[options.channelName] = new MockStream(options);
        }
        return streams[options.channelName];
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

let simpleTestData: TestData = {
  foo: 'foobar',
  bar: {
    baz: 1,
  },
};

interface ModelTestContext extends ModelOptions {
  streams: IStreamFactory;
}

describe('Model', () => {
  beforeEach<ModelTestContext>(async (context) => {
    const ably = new Realtime({});
    const logger = pino({ level: 'silent' });
    context.ably = ably;
    context.logger = logger;
    const { default: provider } = await import('./stream/StreamFactory.js');
    context.streams = new provider({
      ably,
      logger,
      syncOptions: defaultSyncOptions,
      eventBufferOptions: defaultEventBufferOptions,
    });
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
      return { data: simpleTestData, sequenceId: '0' };
    });
    const model = new Model(
      'test',
      { sync: sync, merge: () => simpleTestData },
      {
        ably,
        channelName,
        logger,
        syncOptions: defaultSyncOptions,
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );
    await statePromise(model, 'initialized');
    const modelSynced = model.sync();

    await statePromise(model, 'syncing');
    completeSync();
    await statePromise(model, 'ready');
    expect(sync).toHaveBeenCalledOnce();
    expect(model.data.optimistic).toEqual(simpleTestData);
    expect(model.data.confirmed).toEqual(simpleTestData);
    const syncResult = await modelSynced;
    expect([undefined, { current: 'ready', previous: 'syncing', reason: undefined }]).toContain(syncResult);
  });

  it<ModelTestContext>('allows sync to be called manually, with params', async ({ channelName, ably, logger }) => {
    let completeSync: (...args: any[]) => void = () => {
      throw new Error('completeSync not defined');
    };
    let synchronised = new Promise((resolve) => (completeSync = resolve));
    let counter = 0;
    const sync = vi.fn(async (arg1: number, arg2: string) => {
      await synchronised;
      return { data: `confirmed_${counter++}`, sequenceId: '0', arg1, arg2 };
    });

    const merge = vi.fn((_, event) => event.data);

    const model = new Model(
      'test',
      { sync, merge },
      {
        ably,
        channelName,
        logger,
        syncOptions: defaultSyncOptions,
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );
    const ready = model.sync(1, 'hello');

    await statePromise(model, 'syncing');
    completeSync();

    const registerResult = await ready;
    expect([undefined, { current: 'ready', previous: 'syncing', reason: undefined }]).toContain(registerResult);
    expect(model.state).toEqual('ready');

    expect(sync).toHaveBeenCalledOnce();
    expect(model.data.optimistic).toEqual('confirmed_0');
    expect(model.data.confirmed).toEqual('confirmed_0');

    await model.optimistic({ mutationId: 'mutation-id-1', name: 'testEvent', data: 'optimistic' }); // should be rebased after sync

    completeSync = () => {
      throw new Error('completeSync should have been replaced again');
    };
    synchronised = new Promise((resolve) => {
      completeSync = resolve;
    });

    const resynced = model.sync(2, 'world');
    await statePromise(model, 'syncing');
    completeSync();
    await resynced;
    expect(model.state).toEqual('ready');
    expect(sync).toHaveBeenCalledTimes(2);

    expect(model.data.confirmed).toEqual('confirmed_1');
    expect(model.data.optimistic).toEqual('optimistic');

    expect(sync).toHaveBeenNthCalledWith(1, 1, 'hello');
    expect(sync).toHaveBeenNthCalledWith(2, 2, 'world');
  });

  it<ModelTestContext>('replays from the correct point in the stream', async ({
    channelName,
    ably,
    logger,
    streams,
  }) => {
    const stream = streams.newStream({ channelName });
    stream.replay = vi.fn();

    let i = 0;
    const sync = vi.fn(async () => {
      i++;
      if (i === 1)
        return {
          data: 'data_0',
          sequenceId: '123',
        };
      return {
        data: 'data_1',
        sequenceId: '456',
      };
    });

    const merge = vi.fn((_, event) => event.data);
    const model = new Model(
      'test',
      { sync, merge },
      {
        ably,
        channelName,
        logger,
        syncOptions: defaultSyncOptions,
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );
    await model.sync();

    expect(sync).toHaveBeenCalledOnce();
    expect(stream.replay).toHaveBeenCalledOnce();
    expect(stream.replay).toHaveBeenNthCalledWith(1, '123');

    await model.sync();
    expect(sync).toHaveBeenCalledTimes(2);
    expect(stream.replay).toHaveBeenCalledTimes(2);
    expect(stream.replay).toHaveBeenNthCalledWith(2, '456');
  });

  it<ModelTestContext>('pauses and resumes the model with replay', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channelName });
    const events = {
      channelEvents: new Subject<Types.Message>(),
    };

    s1.subscribe = vi.fn(async (callback) => {
      events.channelEvents.subscribe((message) => callback(null, message));
    });
    s1.reset = vi.fn();
    s1.replay = vi.fn();
    const sync = vi.fn(async () => ({
      data: 'data_0',
      sequenceId: '0',
    }));
    const merge = vi.fn((_, event) => event.data);

    // same timestamp simulates no time elapsed between pause and resume
    let now = Date.now();
    class TestModel<S extends SyncFuncConstraint> extends Model<S> {
      now() {
        return now;
      }
    }

    const model = new TestModel(
      'test',
      { sync, merge },
      {
        ably,
        channelName,
        logger,
        syncOptions: defaultSyncOptions,
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );

    await model.sync();
    expect(sync).toHaveBeenCalledOnce();
    expect(s1.replay).toHaveBeenCalledOnce();

    let subscription = new Subject<void>();
    const subscriptionCalls = getEventPromises(subscription, 4);
    const subscriptionSpy = vi.fn<any, any>(() => subscription.next());
    model.subscribe(subscriptionSpy);

    events.channelEvents.next(createMessage(1));
    events.channelEvents.next(createMessage(2));
    events.channelEvents.next(createMessage(3));

    // wait for the events to be processed, otherwise pause will reset the event queue
    await Promise.all(subscriptionCalls);

    await model.pause();
    expect(model.state).toBe('paused');
    expect(s1.reset).toHaveBeenCalledOnce();

    await model.resume();
    expect(model.state).toBe('ready');
    expect(sync).toHaveBeenCalledOnce(); // no re-sync
    expect(s1.replay).toHaveBeenCalledTimes(2);
    expect(s1.replay).toHaveBeenNthCalledWith(2, '3'); // latest sequence id
  });

  it<ModelTestContext>('pauses and resumes the model with resync after replay failure', async ({
    channelName,
    ably,
    logger,
    streams,
  }) => {
    const s1 = streams.newStream({ channelName });
    const events = {
      channelEvents: new Subject<Types.Message>(),
    };

    s1.subscribe = vi.fn(async (callback) => {
      events.channelEvents.subscribe((message) => callback(null, message));
    });
    s1.reset = vi.fn();
    let i = 0;
    s1.replay = vi.fn(async () => {
      i++;
      if (i === 2) throw new Error('unable to replay');
    });
    const sync = vi.fn(async () => ({
      data: 'data_0',
      sequenceId: '0',
    }));
    const merge = vi.fn((_, event) => event.data);

    // same timestamp simulates no time elapsed between pause and resume
    let now = Date.now();
    class TestModel<S extends SyncFuncConstraint> extends Model<S> {
      now() {
        return now;
      }
    }

    const model = new TestModel(
      'test',
      { sync, merge },
      {
        ably,
        channelName,
        logger,
        syncOptions: defaultSyncOptions,
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );

    await model.sync();
    expect(sync).toHaveBeenCalledOnce();
    expect(s1.replay).toHaveBeenCalledOnce();

    let subscription = new Subject<void>();
    const subscriptionCalls = getEventPromises(subscription, 4);
    const subscriptionSpy = vi.fn<any, any>(() => subscription.next());
    model.subscribe(subscriptionSpy);

    events.channelEvents.next(createMessage(1));
    events.channelEvents.next(createMessage(2));
    events.channelEvents.next(createMessage(3));

    // wait for the events to be processed, otherwise pause will reset the event queue
    await Promise.all(subscriptionCalls);

    await model.pause();
    expect(model.state).toBe('paused');
    expect(s1.reset).toHaveBeenCalledOnce();

    await model.resume();
    expect(model.state).toBe('ready');
    expect(sync).toHaveBeenCalledTimes(2); // re-sync was required after replay failure
    expect(s1.replay).toHaveBeenCalledTimes(3);
    expect(s1.replay).toHaveBeenNthCalledWith(2, '3'); // latest sequence id
    expect(s1.replay).toHaveBeenNthCalledWith(3, '0'); // sequence id from sync
  });

  it<ModelTestContext>('pauses and resumes the model with resync', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channelName });
    const events = {
      channelEvents: new Subject<Types.Message>(),
    };

    s1.subscribe = vi.fn();
    s1.reset = vi.fn();
    s1.replay = vi.fn();
    const sync = vi.fn(async () => ({
      data: 'data_0',
      sequenceId: '0',
    }));
    const merge = vi.fn((_, event) => event.data);

    // same timestamp simulates no time elapsed between pause and resume
    let now = new Date();
    let then = new Date(now);
    then.setMinutes(now.getMinutes() + 3);

    class TestModel<S extends SyncFuncConstraint> extends Model<S> {
      private i = 0;
      now() {
        if (this.i === 0) return now.getTime();
        return then.getTime();
      }
    }

    const model = new TestModel(
      'test',
      { sync, merge },
      {
        ably,
        channelName,
        logger,
        syncOptions: defaultSyncOptions,
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );

    await model.sync();
    expect(sync).toHaveBeenCalledOnce();

    events.channelEvents.next(createMessage(1));
    events.channelEvents.next(createMessage(2));
    events.channelEvents.next(createMessage(3));

    await model.pause();
    expect(model.state).toBe('paused');
    expect(s1.reset).toHaveBeenCalledOnce();

    await model.resume();
    expect(model.state).toBe('ready');
    expect(sync).toHaveBeenCalledTimes(2); // re-sync
    expect(s1.replay).toHaveBeenCalledTimes(2);
    expect(s1.replay).toHaveBeenNthCalledWith(2, '0'); // sequence id from sync
  });

  it<ModelTestContext>('disposes of the model', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channelName });
    s1.subscribe = vi.fn();
    s1.unsubscribe = vi.fn();
    s1.dispose = vi.fn();
    const sync = vi.fn(async () => ({
      data: simpleTestData,
      sequenceId: '0',
    }));

    const model = new Model(
      'test',
      {
        sync: sync,
        merge: (state) => state,
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

    await model.sync();

    expect(sync).toHaveBeenCalledOnce();
    expect(s1.subscribe).toHaveBeenCalledOnce();

    await model.dispose();
    expect(model.state).toBe('disposed');
    expect(s1.unsubscribe).toHaveBeenCalledOnce();
    expect(s1.dispose).toHaveBeenCalled();
  });

  it<ModelTestContext>('subscribes to updates', async ({ channelName, ably, logger, streams }) => {
    const events = {
      channelEvents: new Subject<Types.Message>(),
    };

    streams.newStream({ channelName }).subscribe = vi.fn(async (callback) => {
      events.channelEvents.subscribe((message) => callback(null, message));
    });

    const sync = vi.fn(async () => ({
      data: 'data_0',
      sequenceId: '0',
    }));

    const mergeFn = vi.fn((_, event) => event.data);
    const model = new Model(
      'test',
      { sync: sync, merge: mergeFn },
      {
        ably,
        channelName,
        logger,
        syncOptions: defaultSyncOptions,
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );

    await model.sync();

    expect(sync).toHaveBeenCalledOnce();

    let subscription = new Subject<void>();
    const subscriptionCalls = getEventPromises(subscription, 5);

    const subscriptionSpy = vi.fn<[Error | null, string?]>(() => subscription.next());
    model.subscribe(subscriptionSpy);

    // initial data
    await subscriptionCalls[0];
    expect(subscriptionSpy).toHaveBeenCalledTimes(1);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(1, null, 'data_0');
    expect(model.data.optimistic).toEqual('data_0');
    expect(model.data.confirmed).toEqual('data_0');

    events.channelEvents.next(createMessage(1));
    await subscriptionCalls[1];
    expect(mergeFn).toHaveBeenCalledTimes(1);
    expect(subscriptionSpy).toHaveBeenCalledTimes(2);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_1');
    expect(model.data.optimistic).toEqual('data_1');
    expect(model.data.confirmed).toEqual('data_1');

    events.channelEvents.next(createMessage(2));
    await subscriptionCalls[2];
    expect(mergeFn).toHaveBeenCalledTimes(2);
    expect(subscriptionSpy).toHaveBeenCalledTimes(3);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(3, null, 'data_2');
    expect(model.data.optimistic).toEqual('data_2');
    expect(model.data.confirmed).toEqual('data_2');

    events.channelEvents.next(createMessage(3));
    await subscriptionCalls[3];
    expect(mergeFn).toHaveBeenCalledTimes(3);
    expect(subscriptionSpy).toHaveBeenCalledTimes(4);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(4, null, 'data_3');
    expect(model.data.optimistic).toEqual('data_3');
    expect(model.data.confirmed).toEqual('data_3');

    events.channelEvents.next(createMessage(3));
    await subscriptionCalls[4];
    expect(mergeFn).toHaveBeenCalledTimes(4);
    expect(subscriptionSpy).toHaveBeenCalledTimes(5);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(5, null, 'data_3');
    expect(model.data.optimistic).toEqual('data_3');
    expect(model.data.confirmed).toEqual('data_3');
  });

  it<ModelTestContext>('subscribes to queued updates', async ({ channelName, ably, logger, streams }) => {
    const events = {
      channelEvents: new Subject<Types.Message>(),
    };

    streams.newStream({ channelName }).subscribe = vi.fn(async (callback) => {
      events.channelEvents.subscribe((message) => callback(null, message));
    });

    const sync = vi.fn(async () => ({
      data: ['0'],
      sequenceId: '0',
    }));

    const merge = vi.fn((state, event) => {
      if (event.name === 'add') {
        return state.concat([event.data]);
      }
      return state.filter((item) => item !== event.data);
    });
    const model = new Model(
      'test',
      { sync, merge },
      {
        ably,
        channelName,
        logger,
        syncOptions: defaultSyncOptions,
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );

    await model.sync();

    expect(sync).toHaveBeenCalledOnce();

    let subscription = new Subject<void>();
    const subscriptionCalls = getEventPromises(subscription, 5);

    const subscriptionSpy = vi.fn<[Error | null, string[]?]>(() => subscription.next());
    model.subscribe(subscriptionSpy);

    // initial data
    await subscriptionCalls[0];
    expect(subscriptionSpy).toHaveBeenCalledTimes(1);
    expect(model.data.confirmed).toEqual(['0']);
    expect(model.data.optimistic).toEqual(['0']);

    events.channelEvents.next(customMessage('1', 'add', '1'));
    events.channelEvents.next(customMessage('2', 'add', '2'));
    events.channelEvents.next(customMessage('3', 'delete', '2'));
    events.channelEvents.next(customMessage('4', 'delete', '1'));

    await Promise.all(subscriptionCalls);
    expect(merge).toHaveBeenCalledTimes(4);
    expect(subscriptionSpy).toHaveBeenCalledTimes(5);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(5, null, ['0']);
    expect(model.data.optimistic).toEqual(['0']);
    expect(model.data.confirmed).toEqual(['0']);
  });

  it<ModelTestContext>('subscribes after initialisation', async ({ channelName, ably, logger }) => {
    const sync = vi.fn(async () => ({
      data: 'data_0',
      sequenceId: '0',
    })); // defines initial version of model
    const model = new Model(
      'test',
      { sync, merge: () => 'merged' },
      {
        ably,
        channelName,
        logger,
        syncOptions: defaultSyncOptions,
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );

    await model.sync();

    expect(sync).toHaveBeenCalledOnce();

    // wait for the next event loop iteration so that any scheduled tasks on the tasks queue are cleared,
    // specifically model state updates scheduled via setTimeout from the model init() call in register()
    await timeout();

    let subscription = new Subject<void>();
    const subscriptionCall = getNthEventPromise(subscription, 1);

    const subscriptionSpy = vi.fn<[Error | null, string?]>(() => subscription.next());
    model.subscribe(subscriptionSpy);

    // initial data
    await subscriptionCall;
    expect(subscriptionSpy).toHaveBeenCalledTimes(1);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(1, null, 'data_0');
    expect(model.data.optimistic).toEqual('data_0');
    expect(model.data.confirmed).toEqual('data_0');
  });

  it<ModelTestContext>('ignores errors in subscribe callbacks', async ({ channelName, ably, logger, streams }) => {
    const events = {
      channelEvents: new Subject<Types.Message>(),
    };

    streams.newStream({ channelName }).subscribe = vi.fn(async (callback) => {
      events.channelEvents.subscribe((message) => callback(null, message));
    });

    const sync = vi.fn(async () => ({
      data: 'data_0',
      sequenceId: '0',
    }));

    const mergeFn = vi.fn((_, event) => event.data);
    const model = new Model(
      'test',
      { sync: sync, merge: mergeFn },
      {
        ably,
        channelName,
        logger,
        syncOptions: defaultSyncOptions,
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );

    await model.sync();

    expect(sync).toHaveBeenCalledOnce();

    let subscription = new Subject<void>();
    const subscriptionCalls = getEventPromises(subscription, 5);

    const subscriptionSpy = vi.fn<[Error | null, string?]>(() => {
      subscription.next();
      throw new Error('error in subscribe');
    });
    model.subscribe(subscriptionSpy);

    // initial data
    await subscriptionCalls[0];
    expect(subscriptionSpy).toHaveBeenCalledTimes(1);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(1, null, 'data_0');
    expect(model.data.optimistic).toEqual('data_0');
    expect(model.data.confirmed).toEqual('data_0');

    events.channelEvents.next(createMessage(1));
    await subscriptionCalls[1];
    expect(subscriptionSpy).toHaveBeenCalledTimes(2);
  });

  it<ModelTestContext>('updates model state with optimistic event', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channelName });
    s1.subscribe = vi.fn();
    const mergeFn = vi.fn((_, event) => event.data);
    const model = new Model(
      'test',
      {
        sync: async () => ({
          data: 'data_0',
          sequenceId: '0',
        }),
        merge: mergeFn,
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

    await model.sync();

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
    expect(model.data.optimistic).toEqual('data_0');
    expect(model.data.confirmed).toEqual('data_0');

    await model.optimistic({ mutationId: 'mutation-id-1', name: 'testEvent', data: 'data_1' });

    await optimisticSubscriptionCalls[1];
    expect(model.data.optimistic).toEqual('data_1');
    expect(model.data.confirmed).toEqual('data_0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_1');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);
  });

  it<ModelTestContext>('updates confirmed state', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channelName });
    s1.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn(async (callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });

    const mergeFn = vi.fn((_, event) => event.data);
    const model = new Model(
      'test',
      {
        sync: async () => ({
          data: 'data_0',
          sequenceId: '0',
        }),
        merge: mergeFn,
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
    await model.sync();

    let subscription = new Subject<void>();
    const subscriptionCalls = getEventPromises(subscription, 2);
    const subscriptionSpy = vi.fn<[Error | null, string?]>(() => subscription.next());
    model.subscribe(subscriptionSpy, { optimistic: false });

    await subscriptionCalls[0];
    expect(subscriptionSpy).toHaveBeenCalledTimes(1);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(1, null, 'data_0');
    expect(model.data.optimistic).toEqual('data_0');
    expect(model.data.confirmed).toEqual('data_0');

    events.e1.next(createMessage(1));

    await subscriptionCalls[1];
    expect(subscriptionSpy).toHaveBeenCalledTimes(2);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_1');
    expect(model.data.optimistic).toEqual('data_1');
    expect(model.data.confirmed).toEqual('data_1');
  });

  it<ModelTestContext>('confirms an optimistic event by uuid', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channelName });
    s1.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn(async (callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });
    const mergeFn = vi.fn((_, event) => event.data);

    const model = new Model(
      'test',
      {
        sync: async () => ({
          data: 'data_0',
          sequenceId: '0',
        }),
        merge: mergeFn,
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

    await model.sync();

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
    expect(model.data.optimistic).toEqual('data_0');
    expect(model.data.confirmed).toEqual('data_0');

    const [confirmation] = await model.optimistic({
      mutationId: 'some-custom-id',
      name: 'testEvent',
      data: 'data_1',
    });

    await optimisticSubscriptionCalls[1];
    expect(model.data.optimistic).toEqual('data_1');
    expect(model.data.confirmed).toEqual('data_0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_1');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);

    events.e1.next(
      customMessage('id_1', 'testEvent', 'confirmed_data', { 'x-ably-models-event-uuid': 'some-custom-id' }),
    );
    await confirmedSubscriptionCalls[1];
    await confirmation;
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(2, null, 'confirmed_data');
    expect(model.data.confirmed).toEqual('confirmed_data');
  });

  it<ModelTestContext>('explicitly rejects an optimistic event', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channelName });

    const events = new Subject<Types.Message>();
    s1.subscribe = vi.fn<any, any>((callback) => {
      events.subscribe((message) => callback(null, message));
    });
    const mergeFn = vi.fn((_, event) => event.data);

    const model = new Model(
      'test',
      {
        sync: async () => ({
          data: 'data_0',
          sequenceId: '0',
        }),
        merge: mergeFn,
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

    await model.sync();

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
    expect(model.data.optimistic).toEqual('data_0');
    expect(model.data.confirmed).toEqual('data_0');

    const [confirmation] = await model.optimistic({
      mutationId: 'id_1',
      name: 'testEvent',
      data: 'data_1',
    });

    await optimisticSubscriptionCalls[1];
    expect(model.data.optimistic).toEqual('data_1');
    expect(model.data.confirmed).toEqual('data_0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_1');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);

    events.next(customMessage('id_1', 'testEvent', 'data_1', { 'x-ably-models-reject': 'true' }));
    await expect(confirmation).rejects.toThrow(`events contain rejections: name:testEvent`);
    await optimisticSubscriptionCalls[2];
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(3);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(3, null, 'data_0');
    expect(model.data.optimistic).toEqual('data_0');
    expect(model.data.confirmed).toEqual('data_0');
  });

  it<ModelTestContext>('confirms optimistic events out of order', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channelName });
    s1.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn(async (callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });
    const mergeFn = vi.fn((state, event) => state + event.data);

    const model = new Model(
      'test',
      {
        sync: async () => ({
          data: '0',
          sequenceId: '0',
        }),
        merge: mergeFn,
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

    await model.sync();

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
    expect(model.data.optimistic).toEqual('0');
    expect(model.data.confirmed).toEqual('0');

    await model.optimistic({ mutationId: 'id_1', name: 'testEvent', data: '1' });
    await model.optimistic({ mutationId: 'id_2', name: 'testEvent', data: '2' });

    // optimistic updates are applied in the order the mutations were called
    await optimisticSubscriptionCalls[1];
    await optimisticSubscriptionCalls[2];
    expect(model.data.optimistic).toEqual('012');
    expect(model.data.confirmed).toEqual('0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(3);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '01');
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(3, null, '012');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);

    // You would typically expect the confirmation events to be sent (and arrive) in the
    // same order as their corresponding mutations were applied.
    // However, if this is not the case, we still accept the confirmation, but the
    // optimistic and confirmed states may differ (assuming non-commutative merge functions)
    // since the updates were applied in different order.

    // confirm the second expected event
    events.e1.next(customMessage('id_2', 'testEvent', '2'));
    await confirmedSubscriptionCalls[1];
    expect(model.data.confirmed).toEqual('02');
    await optimisticSubscriptionCalls[3];
    expect(model.data.optimistic).toEqual('021');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '02');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(4);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(4, null, '021');

    // confirm the first expected event
    events.e1.next(customMessage('id_1', 'testEvent', '1'));
    await confirmedSubscriptionCalls[2];
    expect(model.data.optimistic).toEqual('021');
    expect(model.data.confirmed).toEqual('021');
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
    const s1 = streams.newStream({ channelName });
    s1.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn(async (callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });
    const mergeFn = vi.fn((state, event) => state + event.data);

    const model = new Model(
      'test',
      {
        sync: async () => ({
          data: '0',
          sequenceId: '0',
        }),
        merge: mergeFn,
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

    await model.sync();

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
    expect(model.data.optimistic).toEqual('0');
    expect(model.data.confirmed).toEqual('0');

    await model.optimistic({ mutationId: 'id_1', name: 'testEvent', data: '1' });
    await model.optimistic({ mutationId: 'id_2', name: 'testEvent', data: '2' });

    // optimistic updates are applied in the order the mutations were called
    await optimisticSubscriptionCalls[1];
    await optimisticSubscriptionCalls[2];
    expect(model.data.optimistic).toEqual('012');
    expect(model.data.confirmed).toEqual('0');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(3);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '01');
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(3, null, '012');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(1);

    // confirm the first expected event
    events.e1.next(customMessage('id_1', 'testEvent', '1'));
    await confirmedSubscriptionCalls[1];
    expect(model.data.confirmed).toEqual('01');
    await optimisticSubscriptionCalls[3];
    expect(model.data.optimistic).toEqual('012');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(2);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(2, null, '01');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(4);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(4, null, '012');

    // an event is received which does not have a corresponding expected event,
    // and the speculative updates are rebased on top of the incoming event
    events.e1.next(customMessage('id_3', 'testEvent', '3'));
    await confirmedSubscriptionCalls[2];
    expect(model.data.confirmed).toEqual('013');
    await optimisticSubscriptionCalls[4];
    expect(model.data.optimistic).toEqual('0132');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(3);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(3, null, '013');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(5);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(5, null, '0132');

    // confirm the second expected event
    events.e1.next(customMessage('id_2', 'testEvent', '2'));
    await confirmedSubscriptionCalls[3];
    expect(model.data.confirmed).toEqual('0132');
    await optimisticSubscriptionCalls[5];
    expect(model.data.optimistic).toEqual('0132');
    expect(confirmedSubscriptionSpy).toHaveBeenCalledTimes(4);
    expect(confirmedSubscriptionSpy).toHaveBeenNthCalledWith(4, null, '0132');
    expect(optimisticSubscriptionSpy).toHaveBeenCalledTimes(5);
    expect(optimisticSubscriptionSpy).toHaveBeenNthCalledWith(5, null, '0132');
  });

  it<ModelTestContext>('revert optimistic events on cancel', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channelName });
    s1.subscribe = vi.fn();
    const mergeFn = vi.fn((state, event) => state + event.data);

    const model = new Model(
      'test',
      {
        sync: async () => ({
          data: '0',
          sequenceId: '0',
        }),
        merge: mergeFn,
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

    await model.sync();

    const [confirmation, cancel] = await model.optimistic({
      mutationId: 'id_1',
      name: 'testEvent',
      data: '1',
    });
    const [confirmation2, cancel2] = await model.optimistic({
      mutationId: 'id_2',
      name: 'testEvent',
      data: '2',
    });
    const [confirmation3, cancel3] = await model.optimistic({
      mutationId: 'id_3',
      name: 'testEvent',
      data: '3',
    });
    expect(model.data.optimistic).toEqual('0123');

    await cancel();
    await expect(confirmation).rejects.toEqual(new Error('optimistic event cancelled'));
    expect(model.data.optimistic).toEqual('023');

    await cancel2();
    await expect(confirmation2).rejects.toEqual(new Error('optimistic event cancelled'));
    expect(model.data.optimistic).toEqual('03');

    await cancel3();
    await expect(confirmation3).rejects.toEqual(new Error('optimistic event cancelled'));
    expect(model.data.optimistic).toEqual('0');
  });

  // If applying a received stream update throws, the model reverts to the syncing state and re-syncs.
  it<ModelTestContext>('resync if stream apply update fails', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channelName });
    s1.subscribe = vi.fn();

    // event subjects used to invoke the stream subscription callbacks
    // registered by the model, to simulate stream data
    const events = {
      channelEvents: new Subject<Types.Message>(),
    };
    s1.subscribe = vi.fn(async (callback) => {
      events.channelEvents.subscribe((message) => callback(null, message));
    });
    s1.unsubscribe = vi.fn();

    let counter = 0;

    const sync = vi.fn(async () => ({
      data: `${counter}`,
      sequenceId: '0',
    }));

    const mergeFn = vi.fn((_, event) => {
      if (event.data === '3') {
        throw new Error('test');
      }
      return event.data;
    });

    const model = new Model(
      'test',
      { sync: sync, merge: mergeFn },
      {
        ably,
        channelName,
        logger,
        syncOptions: defaultSyncOptions,
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );
    await model.sync();

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
    const syncingPromise = statePromise(model, 'syncing');
    events.channelEvents.next(customMessage('id_3', 'testEvent', String(++counter)));
    const { reason } = (await syncingPromise) as ModelStateChange;
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
    const s1 = streams.newStream({ channelName });
    s1.subscribe = vi.fn();
    const mergeFn = vi.fn((state, event) => {
      if (event.data === '4') {
        throw new Error('update error');
      }
      return state + event.data;
    });

    const model = new Model(
      'test',
      {
        sync: async () => ({
          data: '0',
          sequenceId: '0',
        }),
        merge: mergeFn,
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

    await model.sync();

    await model.optimistic({ mutationId: 'id_1', name: 'testEvent', data: '123' });

    await expect(model.optimistic({ mutationId: 'id_2', name: 'testEvent', data: '4' })).rejects.toThrow(
      'update error',
    );

    // The failed mutation should have been reverted.
    expect(model.data.optimistic).toEqual('0123');
  });

  it<ModelTestContext>('optimistic event confirmation confirmed before timeout', async ({
    channelName,
    ably,
    logger,
    streams,
  }) => {
    const s1 = streams.newStream({ channelName });
    s1.subscribe = vi.fn();

    const events = { e1: new Subject<Types.Message>() };
    s1.subscribe = vi.fn(async (callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });
    const mergeFn = vi.fn((state, event) => state + event.data);

    const model = new Model(
      'test',
      {
        sync: async () => ({
          data: '0',
          sequenceId: '0',
        }),
        merge: mergeFn,
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

    await model.sync();

    const [confirmation] = await model.optimistic({
      mutationId: 'id_1',
      name: 'testEvent',
      data: '1',
    });
    expect(model.data.optimistic).toEqual('01');

    // Confirm the event.
    events.e1.next(customMessage('id_1', 'testEvent', '1'));
    await confirmation;
    expect(model.data.optimistic).toEqual('01');
  });

  it<ModelTestContext>('optimistic event confirmation timeout', async ({ channelName, ably, logger, streams }) => {
    const s1 = streams.newStream({ channelName: 's1' });
    s1.subscribe = vi.fn();

    const events = new Subject<Types.Message>();
    s1.subscribe = vi.fn(async (callback) => {
      events.subscribe((message) => callback(null, message));
    });
    const mergeFn = vi.fn((state, event) => state + event.data);

    const model = new Model(
      'test',
      {
        sync: async () => ({
          data: '0',
          sequenceId: '0',
        }),
        merge: mergeFn,
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

    await model.sync();

    // Mutate and check the returned promise is rejected with a timeout.
    const [confirmation] = await model.optimistic({ mutationId: 'id_1', name: 'testEvent', data: '1' }, { timeout: 1 });
    expect(model.data.optimistic).toEqual('01');

    await expect(confirmation).rejects.toThrow('timed out waiting for event confirmation');
    // Check the optimistic event is reverted.
    expect(model.data.optimistic).toEqual('0');
  });

  it<ModelTestContext>('error from sync function is thrown and sets model to errored after retrying', async ({
    channelName,
    ably,
    logger,
  }) => {
    const mergeFn = vi.fn((state, event) => state + event.data);
    const syncSpy = vi.fn(async () => {
      throw new Error('failed to load from backend');
    });

    const model = new Model(
      'test',
      {
        sync: syncSpy,
        merge: mergeFn,
      },
      {
        ably,
        channelName,
        logger,
        syncOptions: { ...defaultSyncOptions, retryStrategy: fixedRetryStrategy(1, 3) },
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );

    const lis: EventListener<ModelStateChange> = vi.fn<any, any>();
    model.on('errored', lis);

    expect(model.sync()).rejects.toThrow();
    await statePromise(model, 'errored');
    expect(lis).toHaveBeenCalledOnce();
    expect(lis).toHaveBeenCalledWith({
      current: 'errored',
      previous: 'syncing',
      reason: new Error('failed to load from backend'),
    });

    expect(syncSpy).toHaveBeenCalledTimes(3);
  });

  it<ModelTestContext>('sync function succeeds after retrying', async ({ channelName, ably, logger }) => {
    const mergeFn = vi.fn((state, event) => state + event.data);

    let called = false;
    const syncSpy = vi.fn(async () => {
      if (!called) {
        called = true;
        throw new Error('failed to load from backend');
      }

      return { sequenceId: '0', data: '0' };
    });

    const model = new Model(
      'test',
      {
        sync: syncSpy,
        merge: mergeFn,
      },
      {
        ably,
        channelName,
        logger,
        syncOptions: { ...defaultSyncOptions, retryStrategy: fixedRetryStrategy(1, 3) },
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );

    const lis: EventListener<ModelStateChange> = vi.fn<any, any>();
    model.on('errored', lis);

    await model.sync();
    await statePromise(model, 'ready');
    expect(lis).toHaveBeenCalledTimes(0);
    expect(syncSpy).toHaveBeenCalledTimes(2);
  });

  it<ModelTestContext>('error in merge function from optimistic event rejects promise with error', async ({
    channelName,
    ably,
    logger,
    streams,
  }) => {
    const s1 = streams.newStream({ channelName: 's1' });
    s1.subscribe = vi.fn();

    const events = new Subject<Types.Message>();
    s1.subscribe = vi.fn(async (callback) => {
      events.subscribe((message) => callback(null, message));
    });

    const syncFn = vi.fn(async () => {
      return { data: '0', sequenceId: '0' };
    });

    const model = new Model(
      'test',
      {
        sync: syncFn,
        merge: () => {
          throw new Error('merge failed');
        },
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
    model.sync();

    const lis: EventListener<ModelStateChange> = vi.fn<any, any>();
    model.on('errored', lis);

    expect(syncFn).toHaveBeenCalledOnce();
    await statePromise(model, 'ready');
    const result = model.optimistic({ mutationId: 'id_1', name: 'testEvent', data: '1' });
    expect(result).rejects.toThrow();
    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(lis).toHaveBeenCalledTimes(0);
  });

  it<ModelTestContext>('if merge function fails on confirmed event, and subsequent replay fails, set model to errored', async ({
    channelName,
    ably,
    logger,
    streams,
  }) => {
    const s1 = streams.newStream({ channelName: channelName });
    s1.subscribe = vi.fn();

    const events = new Subject<Types.Message>();
    s1.subscribe = vi.fn(async (callback) => {
      events.subscribe((message) => callback(null, message));
    });

    let called = false;
    s1.replay = vi.fn(async () => {
      if (!called) {
        called = true;
        return;
      }

      throw new Error('failed on replay');
    });

    const syncFn = vi.fn(async () => {
      return { data: '0', sequenceId: '0' };
    });

    const model = new Model(
      'test',
      {
        sync: syncFn,
        merge: () => {
          throw new Error('merge failed');
        },
      },
      {
        ably,
        channelName,
        logger,
        syncOptions: { ...defaultSyncOptions, retryStrategy: fixedRetryStrategy(1, 3) },
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );
    model.sync();
    expect(syncFn).toHaveReturnedTimes(1);

    const lis: EventListener<ModelStateChange> = vi.fn<any, any>();
    model.on('errored', lis);

    await statePromise(model, 'ready');
    events.next(customMessage(`0`, 'testEvent', '0'));

    await statePromise(model, 'errored');

    expect(lis).toHaveBeenCalledOnce();
    expect(lis).toHaveBeenCalledWith({
      current: 'errored',
      previous: 'syncing',
      reason: new Error('failed on replay'),
    });

    // called many times because of retry strategy
    expect(syncFn).toHaveBeenCalledTimes(4);
  });
});
