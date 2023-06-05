import { it, describe, expect, beforeEach, afterEach, vi } from 'vitest';
import { Realtime, Types } from 'ably/promises';
import { Subject } from 'rxjs';

import { baseMessage } from './utilities/test/messages';
import Stream, { StreamState } from './Stream';

vi.mock('ably/promises');

interface StreamTestContext {
  client: Types.RealtimePromise;
  channel: Types.RealtimeChannelPromise;
}

interface TestEvent {}

const streamStatePromise = <T>(stream: Stream<T>, state: StreamState) =>
  new Promise((resolve) => stream.whenState(state, stream.state, resolve));

function createMessage(i: number): Types.Message {
  return {
    ...baseMessage,
    id: `id_${i}`,
    name: `name_${i}`,
    data: `data_${i}`,
  };
}

describe('Stream', () => {
  beforeEach<StreamTestContext>((context) => {
    const client = new Realtime({});
    client.connection.whenState = vi.fn<[Types.ConnectionState], Promise<Types.ConnectionStateChange>>(async () => {
      return {
        current: 'connected',
        previous: 'initialized',
      };
    });

    const channel = client.channels.get('foobar');
    channel.on = vi.fn<any, any>(); // all tests call `channel.on('fail')`

    context.client = client;
    context.channel = channel;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it<StreamTestContext>('enters ready state when successfully attached to the channel', async ({ client, channel }) => {
    // the promise returned by the subscribe method resolves when we have successfully attached to the channel
    let attach;
    const attachment = new Promise((resolve) => (attach = resolve));
    channel.subscribe = vi.fn().mockImplementation(async () => {
      await attachment;
    });

    const stream = new Stream<TestEvent>('test', client, { channel: 'foobar' });

    await streamStatePromise<TestEvent>(stream, StreamState.PREPARING);
    attach();
    await streamStatePromise<TestEvent>(stream, StreamState.READY);
    expect(channel.subscribe).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('pauses the stream', async ({ client, channel }) => {
    channel.subscribe = vi.fn<any, any>();
    channel.detach = vi.fn();

    const stream = new Stream<TestEvent>('test', client, { channel: channel.name });

    await streamStatePromise<TestEvent>(stream, StreamState.READY);
    expect(channel.subscribe).toHaveBeenCalledOnce();

    stream.pause();
    await streamStatePromise<TestEvent>(stream, StreamState.PAUSED);
    expect(channel.detach).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('resumes the stream', async ({ client, channel }) => {
    channel.subscribe = vi.fn<any, any>();
    channel.detach = vi.fn<any, any>();
    channel.attach = vi.fn();

    const stream = new Stream<TestEvent>('test', client, { channel: channel.name });

    await streamStatePromise<TestEvent>(stream, StreamState.READY);
    expect(channel.subscribe).toHaveBeenCalledOnce();

    stream.pause();
    await streamStatePromise<TestEvent>(stream, StreamState.PAUSED);
    expect(channel.detach).toHaveBeenCalledOnce();

    stream.resume();
    await streamStatePromise<TestEvent>(stream, StreamState.READY);
    expect(channel.attach).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('disposes of the stream', async ({ client, channel }) => {
    client.channels.release = vi.fn();

    const stream = new Stream<TestEvent>('test', client, { channel: channel.name });

    await streamStatePromise<TestEvent>(stream, StreamState.READY);
    expect(channel.subscribe).toHaveBeenCalledOnce();

    stream.dispose();
    await streamStatePromise<TestEvent>(stream, StreamState.DISPOSED);
    expect(client.channels.release).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('disposes of the stream on channel failed', async ({ client, channel }) => {
    let fail;
    channel.on = vi.fn<any, any>(async (name: string, callback) => {
      if (name === 'failed') {
        fail = callback;
      }
    });

    client.channels.release = vi.fn();

    const stream = new Stream<TestEvent>('test', client, { channel: channel.name });

    await streamStatePromise<TestEvent>(stream, StreamState.READY);
    expect(channel.subscribe).toHaveBeenCalledOnce();

    fail({ reason: 'test' });
    await streamStatePromise<TestEvent>(stream, StreamState.DISPOSED);
    expect(client.channels.release).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('subscribes to messages', async ({ client, channel }) => {
    let messages = new Subject<Types.Message>();
    channel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
    });

    const stream = new Stream<TestEvent>('test', client, { channel: channel.name });
    await streamStatePromise<TestEvent>(stream, StreamState.READY);

    const subscriptionSpy = vi.fn();
    stream.subscribe(subscriptionSpy);

    for (let i = 0; i < 10; i++) {
      messages.next(createMessage(i));
    }

    expect(subscriptionSpy).toHaveBeenCalledTimes(10);
    for (let i = 0; i < 10; i++) {
      expect(subscriptionSpy).toHaveBeenNthCalledWith(i + 1, null, createMessage(i));
    }

    expect(channel.subscribe).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('subscribes with multiple listeners', async ({ client, channel }) => {
    let messages = new Subject<Types.Message>();
    channel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
    });

    const stream = new Stream<TestEvent>('test', client, { channel: channel.name });
    await streamStatePromise<TestEvent>(stream, StreamState.READY);

    const subscriptionSpy1 = vi.fn();
    stream.subscribe(subscriptionSpy1);

    const subscriptionSpy2 = vi.fn();
    stream.subscribe(subscriptionSpy2);

    for (let i = 0; i < 10; i++) {
      messages.next(createMessage(i));
    }

    expect(subscriptionSpy1).toHaveBeenCalledTimes(10);
    expect(subscriptionSpy2).toHaveBeenCalledTimes(10);
    for (let i = 0; i < 10; i++) {
      expect(subscriptionSpy1).toHaveBeenNthCalledWith(i + 1, null, createMessage(i));
      expect(subscriptionSpy2).toHaveBeenNthCalledWith(i + 1, null, createMessage(i));
    }

    expect(channel.subscribe).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('unsubscribes to messages', async ({ client, channel }) => {
    let messages = new Subject<Types.Message>();
    channel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
    });

    const stream = new Stream<TestEvent>('test', client, { channel: channel.name });
    await streamStatePromise<TestEvent>(stream, StreamState.READY);

    const subscriptionSpy = vi.fn();
    stream.subscribe(subscriptionSpy);

    for (let i = 0; i < 10; i++) {
      if (i == 5) {
        stream.unsubscribe(subscriptionSpy);
      }
      messages.next(createMessage(i));
    }

    expect(subscriptionSpy).toHaveBeenCalledTimes(5);
    for (let i = 0; i < 5; i++) {
      expect(subscriptionSpy).toHaveBeenNthCalledWith(i + 1, null, createMessage(i));
    }

    expect(channel.subscribe).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('unsubscribes one of two listeners', async ({ client, channel }) => {
    let messages = new Subject<Types.Message>();
    channel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
    });

    const stream = new Stream<TestEvent>('test', client, { channel: channel.name });
    await streamStatePromise<TestEvent>(stream, StreamState.READY);

    const subscriptionSpy1 = vi.fn();
    stream.subscribe(subscriptionSpy1);

    const subscriptionSpy2 = vi.fn();
    stream.subscribe(subscriptionSpy2);

    for (let i = 0; i < 10; i++) {
      if (i == 5) {
        stream.unsubscribe(subscriptionSpy1);
      }
      messages.next(createMessage(i));
    }

    expect(subscriptionSpy1).toHaveBeenCalledTimes(5);
    expect(subscriptionSpy2).toHaveBeenCalledTimes(10);
    for (let i = 0; i < 10; i++) {
      if (i < 5) {
        expect(subscriptionSpy1).toHaveBeenNthCalledWith(i + 1, null, createMessage(i));
      }
      expect(subscriptionSpy2).toHaveBeenNthCalledWith(i + 1, null, createMessage(i));
    }

    expect(channel.subscribe).toHaveBeenCalledOnce();
  });

  // TODO discontinuity
  // TODO reauth https://ably.com/docs/realtime/channels?lang=nodejs#fatal-errors
});
