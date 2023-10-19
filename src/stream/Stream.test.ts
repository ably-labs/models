import { Realtime, Types } from 'ably/promises';
import pino, { type Logger } from 'pino';
import { Subject } from 'rxjs';
import { it, describe, expect, beforeEach, afterEach, vi } from 'vitest';

import Stream, { HISTORY_PAGE_SIZE, StreamOptions, StreamState } from './Stream.js';
import { createMessage } from '../utilities/test/messages.js';
import { statePromise } from '../utilities/test/promises.js';

vi.mock('ably/promises');

interface StreamTestContext extends StreamOptions {
  channelName: string;
  ably: Types.RealtimePromise;
  logger: Logger;
}

describe('Stream', () => {
  beforeEach<StreamTestContext>((context) => {
    const ably = new Realtime({});
    ably.connection.whenState = vi.fn<[Types.ConnectionState], Promise<Types.ConnectionStateChange>>(async () => {
      return {
        current: 'connected',
        previous: 'initialized',
      };
    });

    const mockChannel = {
      on: vi.fn<any, any>(),
      attach: vi.fn<any, any>(),
      detach: vi.fn<any, any>(),
      subscribe: vi.fn<any, any>(),
    };
    ably.channels.get = vi.fn<any, any>(() => mockChannel);

    context.ably = ably;
    context.logger = pino({ level: 'silent' });
    context.channelName = 'foobar';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it<StreamTestContext>('enters ready state when successfully synced', async ({ ably, logger, channelName }) => {
    const channel = ably.channels.get(channelName);
    channel.attach = vi.fn(
      async (): Promise<Types.ChannelStateChange | null> => ({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      }),
    );
    channel.subscribe = vi.fn<any, any>(async (): Promise<Types.ChannelStateChange | null> => null);
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );

    const stream = new Stream({ ably, logger, channelName: 'foobar' });
    const synced = stream.sync('0');

    await statePromise(stream, StreamState.PREPARING);
    await expect(synced).resolves.toBeUndefined();
    expect(stream.state).toBe(StreamState.READY);

    expect(channel.attach).toHaveBeenCalledOnce();
    expect(channel.subscribe).toHaveBeenCalledOnce();
    expect(channel.history).toHaveBeenCalledOnce();
    expect(channel.history).toHaveBeenNthCalledWith(1, { untilAttach: true, limit: HISTORY_PAGE_SIZE });
  });

  // todo more sync tests
  // todo more subcribe messages tests with history

  it<StreamTestContext>('subscribes to messages', async ({ ably, logger, channelName }) => {
    const channel = ably.channels.get(channelName);
    channel.attach = vi.fn(
      async (): Promise<Types.ChannelStateChange | null> => ({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      }),
    );
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );
    let messages = new Subject<Types.Message>();
    channel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
    });

    const stream = new Stream({ ably, logger, channelName });
    await stream.sync('0');
    await statePromise(stream, StreamState.READY);

    const subscriptionSpy = vi.fn<any, any>();
    stream.subscribe(subscriptionSpy);

    for (let i = 0; i < 10; i++) {
      messages.next(createMessage(i));
    }

    // the 0th message is the sync boundary and should not be emitted
    expect(subscriptionSpy).toHaveBeenCalledTimes(10);
    for (let i = 0; i < 10; i++) {
      expect(subscriptionSpy).toHaveBeenNthCalledWith(i + 1, null, createMessage(i));
    }

    expect(channel.subscribe).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('subscribes with multiple listeners', async ({ ably, logger, channelName }) => {
    let messages = new Subject<Types.Message>();
    const channel = ably.channels.get(channelName);
    channel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
    });
    channel.attach = vi.fn(
      async (): Promise<Types.ChannelStateChange | null> => ({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      }),
    );
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );

    const stream = new Stream({ ably, logger, channelName });
    await stream.sync('0');
    await statePromise(stream, StreamState.READY);

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

  it<StreamTestContext>('unsubscribes to messages', async ({ ably, logger, channelName }) => {
    let messages = new Subject<Types.Message>();
    const channel = ably.channels.get(channelName);
    channel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
    });
    channel.attach = vi.fn(
      async (): Promise<Types.ChannelStateChange | null> => ({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      }),
    );
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );

    const stream = new Stream({ ably, logger, channelName });
    await stream.sync('0');
    await statePromise(stream, StreamState.READY);

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

  it<StreamTestContext>('unsubscribes one of two listeners', async ({ ably, logger, channelName }) => {
    let messages = new Subject<Types.Message>();
    const channel = ably.channels.get(channelName);
    channel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
    });
    channel.attach = vi.fn(
      async (): Promise<Types.ChannelStateChange | null> => ({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      }),
    );
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );

    const stream = new Stream({ ably, logger, channelName });
    await stream.sync('0');
    await statePromise(stream, StreamState.READY);

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

  it<StreamTestContext>('pauses and resumes the stream', async ({ ably, logger, channelName }) => {
    const channel = ably.channels.get(channelName);
    channel.subscribe = vi.fn<any, any>();
    channel.attach = vi.fn(
      async (): Promise<Types.ChannelStateChange | null> => ({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      }),
    );
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );

    const stream = new Stream({ ably, logger, channelName });
    await stream.sync('0');

    await statePromise(stream, StreamState.READY);
    expect(channel.subscribe).toHaveBeenCalledOnce();

    stream.pause();
    await statePromise(stream, StreamState.PAUSED);
    expect(channel.detach).toHaveBeenCalledOnce();

    stream.resume();
    await statePromise(stream, StreamState.READY);
    expect(channel.attach).toHaveBeenCalledTimes(2);
  });

  it<StreamTestContext>('disposes of the stream', async ({ ably, logger, channelName }) => {
    const channel = ably.channels.get(channelName);
    channel.subscribe = vi.fn<any, any>();
    channel.attach = vi.fn(
      async (): Promise<Types.ChannelStateChange | null> => ({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      }),
    );
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );
    ably.channels.release = vi.fn();

    const stream = new Stream({ ably, logger, channelName });
    await stream.sync('0');

    await statePromise(stream, StreamState.READY);
    expect(channel.subscribe).toHaveBeenCalledOnce();

    stream.dispose();
    await statePromise(stream, StreamState.DISPOSED);
    expect(ably.channels.release).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('disposes of the stream on channel failed', async ({ ably, logger, channelName }) => {
    const channel = ably.channels.get(channelName);
    channel.subscribe = vi.fn<any, any>();
    channel.attach = vi.fn(
      async (): Promise<Types.ChannelStateChange | null> => ({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      }),
    );
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );
    ably.channels.release = vi.fn();

    let fail: (...args: any[]) => void = () => {
      throw new Error('fail not defined');
    };
    channel.on = vi.fn<any, any>(async (name: string, callback) => {
      if (name === 'failed') {
        fail = callback;
      }
    });

    const stream = new Stream({ ably, logger, channelName });
    await stream.sync('0');

    await statePromise(stream, StreamState.READY);
    expect(channel.subscribe).toHaveBeenCalledOnce();

    fail({ reason: 'test' });
    await statePromise(stream, StreamState.DISPOSED);
    expect(ably.channels.release).toHaveBeenCalledOnce();
  });
});

// TODO add a stream test that crosses the boundary
