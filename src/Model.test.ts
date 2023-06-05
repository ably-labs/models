import { it, describe, expect, afterEach, vi } from 'vitest';
import { Realtime } from 'ably/promises';

import Model, { ModelState, Versionable } from './Model';
import Stream from './Stream';

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

type TestData = {
  foo: string;
  bar: {
    baz: number;
  };
};

describe('Model', () => {
  afterEach<ModelTestContext>(() => {
    vi.restoreAllMocks();
  });

  it<ModelTestContext>('expects model to be instantiated with the provided event streams', () => {
    const client = new Realtime({});
    const model = new Model<string>('test', {
      streams: [new Stream('s1', client, { channel: 's1' }), new Stream('s2', client, { channel: 's2' })],
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
    const data: Versionable<TestData> = {
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

    const model = new Model<TestData>('test', { streams: [], sync: () => sync() });

    await modelStatePromise(model, ModelState.PREPARING);
    completeSync();
    await modelStatePromise(model, ModelState.READY);
    expect(sync).toHaveBeenCalledOnce();
    expect(model.data).toEqual(data);
  });
});
