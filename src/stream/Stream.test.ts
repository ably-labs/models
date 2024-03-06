import { Realtime, Types } from 'ably/promises';
import pino, { type Logger } from 'pino';
import { Subject } from 'rxjs';
import { it, describe, expect, beforeEach, afterEach, vi } from 'vitest';

import Stream from './Stream.js';
import { defaultSyncOptions, defaultEventBufferOptions } from '../Options.js';
import type { StreamOptions } from '../types/stream.js';
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
      setOptions: vi.fn(),
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

    const stream = new Stream({
      ably,
      logger,
      channelName: 'foobar',
      syncOptions: defaultSyncOptions,
      eventBufferOptions: defaultEventBufferOptions,
    });
    const replayPromise = stream.replay('0');

    await statePromise(stream, 'seeking');
    await expect(replayPromise).resolves.toBeUndefined();
    expect(stream.state).toBe('ready');

    expect(ably.channels.get).toHaveBeenCalledTimes(2);
    expect(ably.channels.get).toHaveBeenNthCalledWith(1, channelName); // initial call from test
    expect(ably.channels.get).toHaveBeenNthCalledWith(2, channelName); // the state in ably is undefined, so the internal call with agent channel param is not triggered
    expect(channel.subscribe).toHaveBeenCalledOnce();
    expect(channel.history).toHaveBeenCalledOnce();
    expect(channel.history).toHaveBeenNthCalledWith(1, {
      untilAttach: true,
      limit: defaultSyncOptions.historyPageSize,
    });
  });

  it<StreamTestContext>('fails to sync if channel is already attached', async ({ ably, logger, channelName }) => {
    const channel = ably.channels.get(channelName);
    channel.subscribe = vi.fn<any, any>(async (): Promise<Types.ChannelStateChange | null> => null);
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );

    const stream = new Stream({
      ably,
      logger,
      channelName: 'foobar',
      syncOptions: defaultSyncOptions,
      eventBufferOptions: defaultEventBufferOptions,
    });
    const replayPromise = stream.replay('0');

    await statePromise(stream, 'seeking');
    await expect(replayPromise).rejects.toThrow(/the channel was already attached when calling subscribe()/);
    expect(stream.state).toBe('errored');

    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    expect(channel.history).toHaveBeenCalledTimes(0);
  });

  it<StreamTestContext>('fails to sync if sequenceId boundary not found in history', async ({
    ably,
    logger,
    channelName,
  }) => {
    const channel = ably.channels.get(channelName);
    ably.channels.release = vi.fn();
    channel.subscribe = vi.fn<any, any>(
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
          items: [createMessage(7), createMessage(6), createMessage(5)],
          hasNext: () => true,
        };
      }
      return {
        items: [createMessage(4), createMessage(3), createMessage(2)],
        hasNext: () => false,
      };
    });

    const stream = new Stream({
      ably,
      logger,
      channelName: 'foobar',
      syncOptions: defaultSyncOptions,
      eventBufferOptions: defaultEventBufferOptions,
    });
    let replayPromise = stream.replay('1');

    await statePromise(stream, 'seeking');
    await expect(replayPromise).rejects.toThrow(/insufficient history to seek to sequenceId 1 in stream/);
    expect(stream.state).toBe('errored');

    expect(channel.subscribe).toHaveBeenCalledOnce();
    expect(channel.history).toHaveBeenCalledTimes(2);
    expect(channel.history).toHaveBeenNthCalledWith(1, {
      untilAttach: true,
      limit: defaultSyncOptions.historyPageSize,
    });
    expect(channel.history).toHaveBeenNthCalledWith(2, {
      untilAttach: true,
      limit: defaultSyncOptions.historyPageSize,
    });

    i = 0;
    replayPromise = stream.replay('2');

    await statePromise(stream, 'seeking');
    await expect(replayPromise).resolves.toBeUndefined();
    expect(stream.state).toBe('ready');
    expect(ably.channels.release).toHaveBeenCalledOnce();

    expect(channel.subscribe).toHaveBeenCalledTimes(2);
    expect(channel.history).toHaveBeenCalledTimes(4);
    expect(channel.history).toHaveBeenNthCalledWith(3, {
      untilAttach: true,
      limit: defaultSyncOptions.historyPageSize,
    });
    expect(channel.history).toHaveBeenNthCalledWith(4, {
      untilAttach: true,
      limit: defaultSyncOptions.historyPageSize,
    });
  });

  it<StreamTestContext>('fails to sync if sequenceId boundary not found in history with final empty page', async ({
    ably,
    logger,
    channelName,
  }) => {
    const channel = ably.channels.get(channelName);
    ably.channels.release = vi.fn();
    channel.subscribe = vi.fn<any, any>(
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

    const stream = new Stream({
      ably,
      logger,
      channelName: 'foobar',
      syncOptions: defaultSyncOptions,
      eventBufferOptions: defaultEventBufferOptions,
    });
    let replayPromise = stream.replay('1');

    await statePromise(stream, 'seeking');
    await expect(replayPromise).rejects.toThrow(/insufficient history to seek to sequenceId 1 in stream/);
    expect(stream.state).toBe('errored');

    expect(channel.subscribe).toHaveBeenCalledOnce();
    expect(channel.history).toHaveBeenCalledTimes(3);
    expect(channel.history).toHaveBeenNthCalledWith(1, {
      untilAttach: true,
      limit: defaultSyncOptions.historyPageSize,
    });
    expect(channel.history).toHaveBeenNthCalledWith(2, {
      untilAttach: true,
      limit: defaultSyncOptions.historyPageSize,
    });
    expect(channel.history).toHaveBeenNthCalledWith(3, {
      untilAttach: true,
      limit: defaultSyncOptions.historyPageSize,
    });

    i = 0;
    replayPromise = stream.replay('2');

    await statePromise(stream, 'seeking');
    await expect(replayPromise).resolves.toBeUndefined();
    expect(stream.state).toBe('ready');
    expect(ably.channels.release).toHaveBeenCalledOnce();

    expect(channel.subscribe).toHaveBeenCalledTimes(2);
    expect(channel.history).toHaveBeenCalledTimes(5);
    expect(channel.history).toHaveBeenNthCalledWith(4, {
      untilAttach: true,
      limit: defaultSyncOptions.historyPageSize,
    });
    expect(channel.history).toHaveBeenNthCalledWith(5, {
      untilAttach: true,
      limit: defaultSyncOptions.historyPageSize,
    });
  });

  it<StreamTestContext>('subscribes to messages', async ({ ably, logger, channelName }) => {
    const channel = ably.channels.get(channelName);
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );
    let messages = new Subject<Types.Message>();
    channel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
      return {
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      };
    });

    const stream = new Stream({
      ably,
      logger,
      channelName,
      syncOptions: defaultSyncOptions,
      eventBufferOptions: defaultEventBufferOptions,
    });
    await stream.replay('0');
    await statePromise(stream, 'ready');

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
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [createMessage(5), createMessage(4), createMessage(3), createMessage(2), createMessage(1)],
        hasNext: () => false,
      }),
    );
    let messages = new Subject<Types.Message>();
    channel.subscribe = vi.fn<any, any>((callback) => {
      messages.subscribe((message) => callback(message));
      return {
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      };
    });

    const stream = new Stream({
      ably,
      logger,
      channelName,
      syncOptions: defaultSyncOptions,
      eventBufferOptions: defaultEventBufferOptions,
    });

    const subscriptionSpy = vi.fn<any, any>();
    stream.subscribe(subscriptionSpy);

    await stream.replay('3');
    await statePromise(stream, 'ready');

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
      return {
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      };
    });

    const stream = new Stream({
      ably,
      logger,
      channelName,
      syncOptions: defaultSyncOptions,
      eventBufferOptions: defaultEventBufferOptions,
    });

    const subscriptionSpy = vi.fn<any, any>();
    stream.subscribe(subscriptionSpy);

    await stream.replay('1');
    await statePromise(stream, 'ready');

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
      return {
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      };
    });
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );

    const stream = new Stream({
      ably,
      logger,
      channelName,
      syncOptions: defaultSyncOptions,
      eventBufferOptions: defaultEventBufferOptions,
    });
    await stream.replay('0');
    await statePromise(stream, 'ready');

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
      return {
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      };
    });
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );

    const stream = new Stream({
      ably,
      logger,
      channelName,
      syncOptions: defaultSyncOptions,
      eventBufferOptions: defaultEventBufferOptions,
    });
    await stream.replay('0');
    await statePromise(stream, 'ready');

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
      return {
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      };
    });
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );

    const stream = new Stream({
      ably,
      logger,
      channelName,
      syncOptions: defaultSyncOptions,
      eventBufferOptions: defaultEventBufferOptions,
    });
    await stream.replay('0');
    await statePromise(stream, 'ready');

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

  it<StreamTestContext>('resets and replays the stream', async ({ ably, logger, channelName }) => {
    const channel = ably.channels.get(channelName);
    ably.channels.release = vi.fn();
    channel.subscribe = vi.fn<any, any>(async () => ({
      current: 'attached',
      previous: 'attaching',
      resumed: false,
      hasBacklog: false,
    }));
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );

    const stream = new Stream({
      ably,
      logger,
      channelName,
      syncOptions: defaultSyncOptions,
      eventBufferOptions: defaultEventBufferOptions,
    });
    await stream.replay('0');

    await statePromise(stream, 'ready');
    expect(channel.subscribe).toHaveBeenCalledOnce();

    await stream.reset();
    await statePromise(stream, 'reset');
    expect(channel.detach).toHaveBeenCalledOnce();
    expect(ably.channels.release).toHaveBeenCalledOnce();

    await stream.replay('0');
    await statePromise(stream, 'ready');
    expect(channel.subscribe).toHaveBeenCalledTimes(2);
  });

  it<StreamTestContext>('disposes of the stream', async ({ ably, logger, channelName }) => {
    const channel = ably.channels.get(channelName);
    channel.subscribe = vi.fn<any, any>(async () => ({
      current: 'attached',
      previous: 'attaching',
      resumed: false,
      hasBacklog: false,
    }));
    channel.history = vi.fn<any, any>(
      async (): Promise<Partial<Types.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );
    ably.channels.release = vi.fn();

    const stream = new Stream({
      ably,
      logger,
      channelName,
      syncOptions: defaultSyncOptions,
      eventBufferOptions: defaultEventBufferOptions,
    });
    await stream.replay('0');

    await statePromise(stream, 'ready');
    expect(channel.subscribe).toHaveBeenCalledOnce();

    stream.dispose();
    await statePromise(stream, 'disposed');
    expect(ably.channels.release).toHaveBeenCalledOnce();
  });

  it<StreamTestContext>('disposes of the stream on channel failed', async ({ ably, logger, channelName }) => {
    const channel = ably.channels.get(channelName);
    channel.subscribe = vi.fn<any, any>(async () => ({
      current: 'attached',
      previous: 'attaching',
      resumed: false,
      hasBacklog: false,
    }));
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

    const stream = new Stream({
      ably,
      logger,
      channelName,
      syncOptions: defaultSyncOptions,
      eventBufferOptions: defaultEventBufferOptions,
    });
    await stream.replay('0');

    await statePromise(stream, 'ready');
    expect(channel.subscribe).toHaveBeenCalledOnce();

    fail({ reason: 'test' });
    await statePromise(stream, 'disposed');
    expect(ably.channels.release).toHaveBeenCalledOnce();
  });
});
