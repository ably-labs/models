import { Realtime, Types } from 'ably/promises';
import pino from 'pino';
import { Subject } from 'rxjs';
import { it, describe, expect, beforeEach, afterEach, vi } from 'vitest';

import Stream, { StreamOptions, StreamState } from './Stream.js';
import StreamFactory from './StreamFactory.js';
import { createMessage } from './utilities/test/messages.js';

vi.mock('ably/promises');

interface StreamTestContext extends StreamOptions {
  ablyChannel: Types.RealtimeChannelPromise;
}

const streamStatePromise = (stream: Stream, state: StreamState) =>
  new Promise((resolve) => stream.whenState(state, stream.state, resolve));

describe('Stream', () => {
  beforeEach<StreamTestContext>((context) => {
    const ably = new Realtime({});
    ably.connection.whenState = vi.fn<[Types.ConnectionState], Promise<Types.ConnectionStateChange>>(async () => {
      return {
        current: 'connected',
        previous: 'initialized',
      };
    });

    const channel = ably.channels.get('foobar');
    channel.on = vi.fn<any, any>(); // all tests call `channel.on('fail')`

    context.ably = ably;
    context.logger = pino({ level: 'silent' });
    context.ablyChannel = channel;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it<StreamTestContext>('enters ready state when successfully attached to the channel', async ({
    ably,
    logger,
    ablyChannel,
  }) => {
    // the promise returned by the subscribe method resolves when we have successfully attached to the channel
    let attach: (...args: any[]) => void = () => {
      throw new Error('attach not defined');
    };
    const attachment = new Promise((resolve) => (attach = resolve));
    ablyChannel.subscribe = vi.fn().mockImplementation(async () => {
      await attachment;
    });

    const stream = new Stream({ ably, logger, channel: 'foobar' });

    await streamStatePromise(stream, StreamState.PREPARING);
    attach();
    await streamStatePromise(stream, StreamState.READY);
    expect(ablyChannel.subscribe).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('pauses and resumes the stream', async ({ ably, logger, ablyChannel }) => {
    ablyChannel.subscribe = vi.fn<any, any>();
    ablyChannel.detach = vi.fn<any, any>();
    ablyChannel.attach = vi.fn();

    const stream = new Stream({ ably, logger, channel: ablyChannel.name });

    await streamStatePromise(stream, StreamState.READY);
    expect(ablyChannel.subscribe).toHaveBeenCalledOnce();

    stream.pause();
    await streamStatePromise(stream, StreamState.PAUSED);
    expect(ablyChannel.detach).toHaveBeenCalledOnce();

    stream.resume();
    await streamStatePromise(stream, StreamState.READY);
    expect(ablyChannel.attach).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('disposes of the stream', async ({ ably, logger, ablyChannel }) => {
    ably.channels.release = vi.fn();

    const stream = new Stream({ ably, logger, channel: ablyChannel.name });

    await streamStatePromise(stream, StreamState.READY);
    expect(ablyChannel.subscribe).toHaveBeenCalledOnce();

    stream.dispose();
    await streamStatePromise(stream, StreamState.DISPOSED);
    expect(ably.channels.release).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('disposes of the stream on channel failed', async ({ ably, logger, ablyChannel }) => {
    let fail: (...args: any[]) => void = () => {
      throw new Error('fail not defined');
    };
    ablyChannel.on = vi.fn<any, any>(async (name: string, callback) => {
      if (name === 'failed') {
        fail = callback;
      }
    });

    ably.channels.release = vi.fn();

    const stream = new Stream({ ably, logger, channel: ablyChannel.name });

    await streamStatePromise(stream, StreamState.READY);
    expect(ablyChannel.subscribe).toHaveBeenCalledOnce();

    fail({ reason: 'test' });
    await streamStatePromise(stream, StreamState.DISPOSED);
    expect(ably.channels.release).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('subscribes to messages', async ({ ably, logger, ablyChannel }) => {
    let messages = new Subject<Types.Message>();
    ablyChannel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
    });

    const stream = new Stream({ ably, logger, channel: ablyChannel.name });
    await streamStatePromise(stream, StreamState.READY);

    const subscriptionSpy = vi.fn();
    stream.subscribe(subscriptionSpy);

    for (let i = 0; i < 10; i++) {
      messages.next(createMessage(i));
    }

    expect(subscriptionSpy).toHaveBeenCalledTimes(10);
    for (let i = 0; i < 10; i++) {
      expect(subscriptionSpy).toHaveBeenNthCalledWith(i + 1, null, createMessage(i));
    }

    expect(ablyChannel.subscribe).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('subscribes with multiple listeners', async ({ ably, logger, ablyChannel }) => {
    let messages = new Subject<Types.Message>();
    ablyChannel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
    });

    const stream = new Stream({ ably, logger, channel: ablyChannel.name });
    await streamStatePromise(stream, StreamState.READY);

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

    expect(ablyChannel.subscribe).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('unsubscribes to messages', async ({ ably, logger, ablyChannel }) => {
    let messages = new Subject<Types.Message>();
    ablyChannel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
    });

    const stream = new Stream({ ably, logger, channel: ablyChannel.name });
    await streamStatePromise(stream, StreamState.READY);

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

    expect(ablyChannel.subscribe).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('unsubscribes one of two listeners', async ({ ably, logger, ablyChannel }) => {
    let messages = new Subject<Types.Message>();
    ablyChannel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
    });

    const stream = new Stream({ ably, logger, channel: ablyChannel.name });
    await streamStatePromise(stream, StreamState.READY);

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

    expect(ablyChannel.subscribe).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('succeeds with gte zero event buffer ms', async ({ ably, logger }) => {
    new StreamFactory({ eventBufferOptions: { bufferMs: 0 }, ably, logger });
    new StreamFactory({ eventBufferOptions: { bufferMs: 1 }, ably, logger });
  });

  it<StreamTestContext>('fails with lt zero event buffer ms', async ({ ably, logger }) => {
    try {
      new StreamFactory({ eventBufferOptions: { bufferMs: -1 }, ably, logger });
      expect(true).toBe(false);
    } catch (err) {
      expect(err.toString(), 'Stream registry should have thrown an error').not.toContain('AssertionError');
    }
  });

  // TODO reauth https://ably.com/docs/realtime/channels?lang=nodejs#fatal-errors
});
