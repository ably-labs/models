import { it, describe, expect, afterEach, vi } from 'vitest';
import { Realtime, Types } from 'ably/promises';
import { Subject, lastValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { createMessage } from './utilities/test/messages';
import Model, { ModelState, Versioned } from './Model';
import Stream from './Stream';
import { StandardCallback } from './types/callbacks';

interface ModelTestContext {}

vi.mock('ably/promises');

vi.mock('./Stream', async () => {
  class MockStream {
    constructor(readonly name: string) {}
  }
  return {
    default: MockStream,
  };
});

const modelStatePromise = <T>(model: Model<T>, state: ModelState) =>
  new Promise((resolve) => model.whenState(state, model.state, resolve));

describe('Model', () => {
  afterEach<ModelTestContext>(() => {
    vi.restoreAllMocks();
  });

  it<ModelTestContext>('expects model to be instantiated with the provided event streams', () => {
    const client = new Realtime({});
    const model = new Model<string>('test', {
      streams: {
        s1: new Stream('s1', client, { channel: 's1' }),
        s2: new Stream('s2', client, { channel: 's2' }),
      },
      sync: async () => ({ version: 1, data: 'foobar' }),
    });
    expect(model.name).toEqual('test');
    expect(model.stream('s1')).toBeTruthy();
    expect(model.stream('s1').name).toEqual('s1');
    expect(model.stream('s2')).toBeTruthy();
    expect(model.stream('s2').name).toEqual('s2');
    expect(() => model.stream('s3')).toThrowError("stream with name 's3' not registered on model 'test'");
  });

  it<ModelTestContext>('enters ready state when successfully synchronised', async () => {
    type TestData = {
      foo: string;
      bar: {
        baz: number;
      };
    };
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

    const model = new Model<TestData>('test', { streams: {}, sync: () => sync() });
    await modelStatePromise(model, ModelState.INITIALIZED);

    model.start();
    await modelStatePromise(model, ModelState.PREPARING);
    completeSync();
    await modelStatePromise(model, ModelState.READY);
    expect(sync).toHaveBeenCalledOnce();
    expect(model.data).toEqual(data);
  });

  it<ModelTestContext>('invokes update functions on stream events', async () => {
    const client = new Realtime({});
    const data: Versioned<any> = {
      version: 0,
      data: 'foobar',
    };

    const sync = vi.fn(async () => data);
    const s1 = new Stream('s1', client, { channel: 's1' });
    const s2 = new Stream('s2', client, { channel: 's2' });
    const model = new Model<string>('test', {
      streams: { s1, s2 },
      sync,
    });
    await modelStatePromise(model, ModelState.INITIALIZED);

    const update1 = vi.fn<[state: Versioned<any>, event: Types.Message], Promise<Versioned<any>>>(
      async (state, event) => ({
        version: state.version + 1,
        data: event.data,
      }),
    );
    model.registerUpdate('s1', 'name_1', update1);
    const update2 = vi.fn<[state: Versioned<any>, event: Types.Message], Promise<Versioned<any>>>(
      async (state, event) => ({
        version: state.version + 1,
        data: event.data,
      }),
    );
    model.registerUpdate('s2', 'name_2', update2);

    let events1 = new Subject<Types.Message>();
    s1.subscribe = vi.fn<[StandardCallback<Types.Message>], void>((callback) => {
      events1.subscribe((message) => callback(null, message));
    });
    let events2 = new Subject<Types.Message>();
    s2.subscribe = vi.fn<[StandardCallback<Types.Message>], void>((callback) => {
      events2.subscribe((message) => callback(null, message));
    });

    let subscription = new Subject<void>();
    const subscriptionSpy = vi.fn<[Error | null | undefined, string | undefined]>(() => subscription.next());
    model.subscribe(subscriptionSpy);

    model.start();
    await modelStatePromise(model, ModelState.READY);
    expect(sync).toHaveBeenCalledOnce();
    events1.next(createMessage(1));
    expect(update1).toHaveBeenCalledOnce();
    await lastValueFrom(subscription.pipe(take(1)));
    expect(subscriptionSpy).toHaveBeenCalledOnce();
    expect(subscriptionSpy).toHaveBeenNthCalledWith(1, null, 'data_1');
    events1.next(createMessage(2));
    expect(update1).toHaveBeenCalledOnce();
    expect(subscriptionSpy).toHaveBeenCalledOnce();
    events2.next(createMessage(2));
    expect(update2).toHaveBeenCalledOnce();
    await lastValueFrom(subscription.pipe(take(1)));
    expect(subscriptionSpy).toHaveBeenCalledTimes(2);
    expect(subscriptionSpy).toHaveBeenNthCalledWith(2, null, 'data_2');
    expect(model.data).toEqual({
      version: 2,
      data: 'data_2',
    });
  });
});
