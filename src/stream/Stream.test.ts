import { Realtime, Types } from 'ably/promises';
import pino, { type Logger } from 'pino';
import { Subject } from 'rxjs';
import { it, describe, expect, beforeEach, afterEach, vi } from 'vitest';

import Stream, { HISTORY_PAGE_SIZE, StreamOptions, StreamState } from './Stream.js';
import { statePromise } from '../utilities/promises.js';
import { createMessage } from '../utilities/test/messages.js';

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

  it<StreamTestContext>('successfully syncs with no history', async ({ ably, logger, channelName }) => {
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

  it<StreamTestContext>('fails to sync if channel unexpectedly attached', async ({ ably, logger, channelName }) => {
    const channel = ably.channels.get(channelName);
    channel.attach = vi.fn(async (): Promise<Types.ChannelStateChange | null> => null);
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
    await expect(synced).rejects.toThrow(/the channel was already attached when calling attach()/);
    expect(stream.state).toBe(StreamState.ERRORED);

    expect(channel.attach).toHaveBeenCalledOnce();
    expect(channel.subscribe).toHaveBeenCalledTimes(0);
    expect(channel.history).toHaveBeenCalledTimes(0);
  });

  it<StreamTestContext>('fails to sync if channel not attached when subscribing', async ({
    ably,
    logger,
    channelName,
  }) => {
    const channel = ably.channels.get(channelName);
    channel.attach = vi.fn(
      async (): Promise<Types.ChannelStateChange | null> => ({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      }),
    );
    channel.subscribe = vi.fn<any, any>(
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

    const stream = new Stream({ ably, logger, channelName: 'foobar' });
    const synced = stream.sync('0');

    await statePromise(stream, StreamState.PREPARING);
    await expect(synced).rejects.toThrow(/the channel was not attached when calling subscribe()/);
    expect(stream.state).toBe(StreamState.ERRORED);

    expect(channel.attach).toHaveBeenCalledOnce();
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    expect(channel.history).toHaveBeenCalledTimes(0);
  });

  it<StreamTestContext>('fails to sync if sequenceID boundary not found in history', async ({
    ably,
    logger,
    channelName,
  }) => {
    const channel = ably.channels.get(channelName);
    ably.channels.release = vi.fn();
    channel.attach = vi.fn(
      async (): Promise<Types.ChannelStateChange | null> => ({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      }),
    );
    channel.subscribe = vi.fn<any, any>(async (): Promise<Types.ChannelStateChange | null> => null);
    let i = 0;
    channel.history = vi.fn<any, any>(async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => {
      i++;
      if (i === 1) {
        return {
          items: [createMessage(7), createMessage(6), createMessage(5)],
          hasNext: () => true,
        };
      }
      return {
        items: [createMessage(4), createMessage(3), createMessage(2)],
        hasNext: () => false,
      };
    });

    const stream = new Stream({ ably, logger, channelName: 'foobar' });
    let synced = stream.sync('1');

    await statePromise(stream, StreamState.PREPARING);
    await expect(synced).rejects.toThrow(/insufficient history to seek to sequenceID 1 in stream/);
    expect(stream.state).toBe(StreamState.ERRORED);

    expect(channel.attach).toHaveBeenCalledOnce();
    expect(channel.subscribe).toHaveBeenCalledOnce();
    expect(channel.history).toHaveBeenCalledTimes(2);
    expect(channel.history).toHaveBeenNthCalledWith(1, { untilAttach: true, limit: HISTORY_PAGE_SIZE });
    expect(channel.history).toHaveBeenNthCalledWith(2, { untilAttach: true, limit: HISTORY_PAGE_SIZE });

    i = 0;
    synced = stream.sync('2');

    await statePromise(stream, StreamState.PREPARING);
    await expect(synced).resolves.toBeUndefined();
    expect(stream.state).toBe(StreamState.READY);
    expect(ably.channels.release).toHaveBeenCalledOnce();

    expect(channel.attach).toHaveBeenCalledTimes(2);
    expect(channel.subscribe).toHaveBeenCalledTimes(2);
    expect(channel.history).toHaveBeenCalledTimes(4);
    expect(channel.history).toHaveBeenNthCalledWith(3, { untilAttach: true, limit: HISTORY_PAGE_SIZE });
    expect(channel.history).toHaveBeenNthCalledWith(4, { untilAttach: true, limit: HISTORY_PAGE_SIZE });
  });

  it<StreamTestContext>('fails to sync if sequenceID boundary not found in history with final empty page', async ({
    ably,
    logger,
    channelName,
  }) => {
    const channel = ably.channels.get(channelName);
    ably.channels.release = vi.fn();
    channel.attach = vi.fn(
      async (): Promise<Types.ChannelStateChange | null> => ({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      }),
    );
    channel.subscribe = vi.fn<any, any>(async (): Promise<Types.ChannelStateChange | null> => null);
    let i = 0;
    channel.history = vi.fn<any, any>(async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => {
      i++;
      if (i === 1) {
        return {
          items: [createMessage(7), createMessage(6), createMessage(5)],
          hasNext: () => true,
        };
      } else if (i === 2) {
        return {
          items: [createMessage(4), createMessage(3), createMessage(2)],
          hasNext: () => true,
        };
      }
      return {
        items: [],
        hasNext: () => false,
      };
    });

    const stream = new Stream({ ably, logger, channelName: 'foobar' });
    let synced = stream.sync('1');

    await statePromise(stream, StreamState.PREPARING);
    await expect(synced).rejects.toThrow(/insufficient history to seek to sequenceID 1 in stream/);
    expect(stream.state).toBe(StreamState.ERRORED);

    expect(channel.attach).toHaveBeenCalledOnce();
    expect(channel.subscribe).toHaveBeenCalledOnce();
    expect(channel.history).toHaveBeenCalledTimes(3);
    expect(channel.history).toHaveBeenNthCalledWith(1, { untilAttach: true, limit: HISTORY_PAGE_SIZE });
    expect(channel.history).toHaveBeenNthCalledWith(2, { untilAttach: true, limit: HISTORY_PAGE_SIZE });
    expect(channel.history).toHaveBeenNthCalledWith(3, { untilAttach: true, limit: HISTORY_PAGE_SIZE });

    i = 0;
    synced = stream.sync('2');

    await statePromise(stream, StreamState.PREPARING);
    await expect(synced).resolves.toBeUndefined();
    expect(stream.state).toBe(StreamState.READY);
    expect(ably.channels.release).toHaveBeenCalledOnce();

    expect(channel.attach).toHaveBeenCalledTimes(2);
    expect(channel.subscribe).toHaveBeenCalledTimes(2);
    expect(channel.history).toHaveBeenCalledTimes(5);
    expect(channel.history).toHaveBeenNthCalledWith(4, { untilAttach: true, limit: HISTORY_PAGE_SIZE });
    expect(channel.history).toHaveBeenNthCalledWith(5, { untilAttach: true, limit: HISTORY_PAGE_SIZE });
  });

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

  it<StreamTestContext>('subscribes to messages with history page', async ({ ably, logger, channelName }) => {
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
        items: [createMessage(5), createMessage(4), createMessage(3), createMessage(2), createMessage(1)],
        hasNext: () => false,
      }),
    );
    let messages = new Subject<Types.Message>();
    channel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
    });

    const stream = new Stream({ ably, logger, channelName });

    const subscriptionSpy = vi.fn<any, any>();
    stream.subscribe(subscriptionSpy);

    await stream.sync('3');
    await statePromise(stream, StreamState.READY);

    // live messages
    for (let i = 6; i <= 10; i++) {
      messages.next(createMessage(i));
    }

    // the 0th message is the sync boundary and should not be emitted
    expect(subscriptionSpy).toHaveBeenCalledTimes(7);
    for (let i = 4; i <= 10; i++) {
      expect(subscriptionSpy).toHaveBeenNthCalledWith(i - 3, null, createMessage(i));
    }

    expect(channel.subscribe).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('subscribes to messages with multiple history pages', async ({ ably, logger, channelName }) => {
    const channel = ably.channels.get(channelName);
    channel.attach = vi.fn(
      async (): Promise<Types.ChannelStateChange | null> => ({
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      }),
    );
    let i = 0;
    channel.history = vi.fn<any, any>(async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => {
      i++;
      if (i === 1) {
        return {
          items: [createMessage(5), createMessage(4), createMessage(3)],
          hasNext: () => true,
        };
      }
      return {
        items: [createMessage(2), createMessage(1), createMessage(0)],
        hasNext: () => false,
      };
    });
    let messages = new Subject<Types.Message>();
    channel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
    });

    const stream = new Stream({ ably, logger, channelName });

    const subscriptionSpy = vi.fn<any, any>();
    stream.subscribe(subscriptionSpy);

    await stream.sync('1');
    await statePromise(stream, StreamState.READY);

    // live messages
    for (let i = 6; i < 10; i++) {
      messages.next(createMessage(i));
    }

    // the 0th message is the sync boundary and should not be emitted
    expect(subscriptionSpy).toHaveBeenCalledTimes(8);
    for (let i = 2; i < 10; i++) {
      expect(subscriptionSpy).toHaveBeenNthCalledWith(i - 1, null, createMessage(i));
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
