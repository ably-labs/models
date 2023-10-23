import { Realtime, Types } from 'ably/promises';
import pino from 'pino';
import { it, describe, expect, beforeEach, afterEach, vi } from 'vitest';

import { numericOtherwiseLexicographicOrderer } from './Middleware.js';
import { type StreamOptions } from './Stream.js';
import StreamFactory from './StreamFactory.js';

vi.mock('ably/promises');

interface StreamTestContext extends StreamOptions {
  ablyChannel: Types.RealtimeChannelPromise;
}

describe('StreamFactory', () => {
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

  it<StreamTestContext>('succeeds with valid configurations', async ({ ably, logger }) => {
    new StreamFactory({ ably, logger });
    new StreamFactory({
      eventBufferOptions: { bufferMs: 0, eventOrderer: numericOtherwiseLexicographicOrderer },
      ably,
      logger,
    });
    new StreamFactory({
      eventBufferOptions: { bufferMs: 1, eventOrderer: numericOtherwiseLexicographicOrderer },
      ably,
      logger,
    });
    new StreamFactory({ eventBufferOptions: { bufferMs: 1, eventOrderer: () => -1 }, ably, logger });
    new StreamFactory({ syncOptions: { historyPageSize: 1 }, ably, logger });
  });

  it<StreamTestContext>('fails with lt zero event buffer ms', async ({ ably, logger }) => {
    try {
      new StreamFactory({
        eventBufferOptions: { bufferMs: -1, eventOrderer: numericOtherwiseLexicographicOrderer },
        ably,
        logger,
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err.toString(), 'Stream registry should have thrown an error').not.toContain('AssertionError');
    }
  });

  it<StreamTestContext>('fails with zero history page size', async ({ ably, logger }) => {
    try {
      new StreamFactory({ syncOptions: { historyPageSize: 0 }, ably, logger });
      expect(true).toBe(false);
    } catch (err) {
      expect(err.toString(), 'Stream registry should have thrown an error').not.toContain('AssertionError');
    }
  });

  it<StreamTestContext>('fails with lt zero history page size', async ({ ably, logger }) => {
    try {
      new StreamFactory({ syncOptions: { historyPageSize: -1 }, ably, logger });
      expect(true).toBe(false);
    } catch (err) {
      expect(err.toString(), 'Stream registry should have thrown an error').not.toContain('AssertionError');
    }
  });
});
