import { it, describe, expect, afterEach, vi, beforeEach } from 'vitest';
import { Realtime, Types } from 'ably/promises';
import { Subject, lastValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { createMessage } from './utilities/test/messages';
import Model, { ModelState, Versioned, Streams } from './Model';
import Stream from './Stream';

vi.mock('ably/promises');

vi.mock('./Stream', async () => {
  class MockStream {
    constructor(readonly name: string) {}
  }
  return {
    default: MockStream,
  };
});

type TestData = {
  foo: string;
  bar: {
    baz: number;
  };
};

interface ModelTestContext {
  streams: Streams;
}

const modelStatePromise = <T>(model: Model<T>, state: ModelState) =>
  new Promise((resolve) => model.whenState(state, model.state, resolve));

describe('Model', () => {
  beforeEach<ModelTestContext>((context) => {
    const client = new Realtime({});

    const streams: Streams = {
      s1: new Stream('s1', client, { channel: 's1' }),
      s2: new Stream('s2', client, { channel: 's2' }),
    };

    context.streams = streams;
  });

  afterEach<ModelTestContext>(() => {
    vi.restoreAllMocks();
  });

  it<ModelTestContext>('expects model to be instantiated with the provided event streams', ({ streams }) => {
    streams.s1.subscribe = vi.fn();
    streams.s2.subscribe = vi.fn();
    const model = new Model<string>('test', { streams, sync: async () => ({ version: 1, data: 'foobar' }) });
    expect(model.name).toEqual('test');
    expect(model.stream('s1')).toBeTruthy();
    expect(model.stream('s1').name).toEqual('s1');
    expect(model.stream('s2')).toBeTruthy();
    expect(model.stream('s2').name).toEqual('s2');
    expect(() => model.stream('s3')).toThrowError("stream with name 's3' not registered on model 'test'");
  });

  it<ModelTestContext>('enters ready state after sync and subscribed to streams', async ({ streams }) => {
    const data: Versioned<TestData> = {
      version: 1,
      data: {
        foo: 'foobar',
        bar: {
          baz: 1,
        },
      },
    };

    // the promise returned by the subscribe method resolves when we have successfully attached to the channel
    let completeSync;
    const synchronised = new Promise((resolve) => (completeSync = resolve));
    const sync = vi.fn(async () => {
      await synchronised;
      return data;
    });

    streams.s1.subscribe = vi.fn();
    streams.s2.subscribe = vi.fn();

    const model = new Model<TestData>('test', {
      streams,
      sync: () => sync(),
    });
    await modelStatePromise(model, ModelState.PREPARING);
    completeSync();
    await modelStatePromise(model, ModelState.READY);
    expect(streams.s1.subscribe).toHaveBeenCalledOnce();
    expect(streams.s2.subscribe).toHaveBeenCalledOnce();
    expect(sync).toHaveBeenCalledOnce();
    expect(model.data).toEqual(data);
  });

  it<ModelTestContext>('pauses and resumes the model', async ({ streams }) => {
    streams.s1.subscribe = vi.fn();
    streams.s2.subscribe = vi.fn();
    streams.s1.pause = vi.fn();
    streams.s2.pause = vi.fn();
    streams.s1.resume = vi.fn();
    streams.s2.resume = vi.fn();
    const sync = vi.fn();

    const model = new Model<TestData>('test', { streams, sync });

    await modelStatePromise(model, ModelState.READY);
    expect(streams.s1.subscribe).toHaveBeenCalledOnce();
    expect(streams.s2.subscribe).toHaveBeenCalledOnce();

    model.pause();
    await modelStatePromise(model, ModelState.PAUSED);
    expect(streams.s1.pause).toHaveBeenCalledOnce();
    expect(streams.s2.pause).toHaveBeenCalledOnce();

    model.resume();
    await modelStatePromise(model, ModelState.READY);
    expect(streams.s1.resume).toHaveBeenCalledOnce();
    expect(streams.s2.resume).toHaveBeenCalledOnce();
  });

  it<ModelTestContext>('disposes of the model', async ({ streams }) => {
    streams.s1.subscribe = vi.fn();
    streams.s2.subscribe = vi.fn();
    streams.s1.unsubscribe = vi.fn();
    streams.s2.unsubscribe = vi.fn();
    const sync = vi.fn();

    const model = new Model<TestData>('test', { streams, sync });

    await modelStatePromise(model, ModelState.READY);
    expect(sync).toHaveBeenCalledOnce();
    expect(streams.s1.subscribe).toHaveBeenCalledOnce();
    expect(streams.s2.subscribe).toHaveBeenCalledOnce();

    model.dispose();
    await modelStatePromise(model, ModelState.DISPOSED);
    expect(streams.s1.unsubscribe).toHaveBeenCalledOnce();
    expect(streams.s2.unsubscribe).toHaveBeenCalledOnce();
  });

  it<ModelTestContext>('subscribes to updates', async ({ streams }) => {
    const data: Versioned<any> = {
      version: 0,
      data: 'foobar',
    };

    // event subjects used to invoke the stream subscription callbacks
    // registered by the model, to simulate stream data
    const events = {
      e1: new Subject<Types.Message>(),
      e2: new Subject<Types.Message>(),
    };
    streams.s1.subscribe = vi.fn((callback) => {
      events.e1.subscribe((message) => callback(null, message));
    });
    streams.s2.subscribe = vi.fn((callback) => {
      events.e2.subscribe((message) => callback(null, message));
    });

    const sync = vi.fn(async () => data); // defines initial version of model
    const model = new Model<string>('test', { streams, sync });

    const update1 = vi.fn(async (state, event) => ({
      version: state.version + 1,
      data: event.data,
    }));
    model.registerUpdate('s1', 'name_1', update1);
    const update2 = vi.fn(async (state, event) => ({
      version: state.version + 1,
      data: event.data,
    }));
    model.registerUpdate('s2', 'name_2', update2);
    const update3 = vi.fn(async (state, event) => ({
      version: state.version + 1,
      data: event.data,
    }));
    model.registerUpdate('s1', 'name_3', update3);
    model.registerUpdate('s2', 'name_3', update3);

    await modelStatePromise(model, ModelState.READY);
    expect(sync).toHaveBeenCalledOnce();

    let subscription = new Subject<void>();
    const subscriptionSpy = vi.fn<[Error | null | undefined, string | undefined]>(() => subscription.next());
    model.subscribe(subscriptionSpy);

    const subscriptionCalled = () => lastValueFrom(subscription.pipe(take(1)));

    events.e1.next(createMessage(1));
    await subscriptionCalled();
    expect(update1).toHaveBeenCalledTimes(1);
    expect(update2).toHaveBeenCalledTimes(0);
    expect(update3).toHaveBeenCalledTimes(0);
    expect(subscriptionSpy).toHaveBeenCalledTimes(1);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(1, null, 'data_1');

    events.e2.next(createMessage(2));
    await subscriptionCalled();
    expect(update1).toHaveBeenCalledTimes(1);
    expect(update2).toHaveBeenCalledTimes(1);
    expect(update3).toHaveBeenCalledTimes(0);
    expect(subscriptionSpy).toHaveBeenCalledTimes(2);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_2');

    events.e1.next(createMessage(3));
    await subscriptionCalled();
    expect(update1).toHaveBeenCalledTimes(1);
    expect(update2).toHaveBeenCalledTimes(1);
    expect(update3).toHaveBeenCalledTimes(1);
    expect(subscriptionSpy).toHaveBeenCalledTimes(3);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(3, null, 'data_3');

    events.e2.next(createMessage(3));
    await subscriptionCalled();
    expect(update1).toHaveBeenCalledTimes(1);
    expect(update2).toHaveBeenCalledTimes(1);
    expect(update3).toHaveBeenCalledTimes(2);
    expect(subscriptionSpy).toHaveBeenCalledTimes(4);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(4, null, 'data_3');

    expect(model.data).toEqual({
      version: 4,
      data: 'data_3',
    });
  });

  it<ModelTestContext>('executes a registered mutation', async ({ streams }) => {
    streams.s1.subscribe = vi.fn();
    streams.s2.subscribe = vi.fn();
    const model = new Model<string>('test', { streams, sync: async () => ({ version: 1, data: 'foobar' }) });
    await modelStatePromise(model, ModelState.READY);

    const mutation = vi.fn();
    model.registerMutation('foo', mutation);
    expect(mutation).toHaveBeenCalledTimes(0);
    await model.mutate<[string, number], void>('foo', 'bar', 123);
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledWith('bar', 123);
  });

  it<ModelTestContext>('fails to register a duplicate mutation', async ({ streams }) => {
    streams.s1.subscribe = vi.fn();
    streams.s2.subscribe = vi.fn();
    const model = new Model<string>('test', { streams, sync: async () => ({ version: 1, data: 'foobar' }) });
    await modelStatePromise(model, ModelState.READY);

    const mutation = vi.fn();
    model.registerMutation('foo', mutation);
    expect(mutation).toHaveBeenCalledTimes(0);
    expect(() => model.registerMutation('foo', mutation)).toThrowError(
      `mutation with name 'foo' already registered on model 'test'`,
    );
  });

  // TODO disposes of the model on stream failed
});
