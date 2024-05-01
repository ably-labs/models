import { Realtime, RealtimeChannel, ConnectionState, ConnectionStateChange } from 'ably';
import pino from 'pino';
import { it, describe, expect, beforeEach, afterEach, vi } from 'vitest';

import { numericOtherwiseLexicographicOrderer } from './Middleware.js';
import StreamFactory from './StreamFactory.js';
import { defaultEventBufferOptions, defaultSyncOptions } from '../Options.js';
import type { StreamOptions } from '../types/stream.js';

vi.mock('ably');

interface StreamTestContext extends StreamOptions {
  ablyChannel: RealtimeChannel;
}

describe('StreamFactory', () => {
  beforeEach<StreamTestContext>((context) => {
    const ably = new Realtime({});
    ably.connection.whenState = vi.fn<[ConnectionState], Promise<ConnectionStateChange>>(async () => {
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
    new StreamFactory({ ably, logger, eventBufferOptions: defaultEventBufferOptions, syncOptions: defaultSyncOptions });
    new StreamFactory({
      ably,
      logger,
      eventBufferOptions: { bufferMs: 0, eventOrderer: numericOtherwiseLexicographicOrderer },
      syncOptions: defaultSyncOptions,
    });
    new StreamFactory({
      ably,
      logger,
      eventBufferOptions: { bufferMs: 1, eventOrderer: numericOtherwiseLexicographicOrderer },
      syncOptions: defaultSyncOptions,
    });
    new StreamFactory({
      ably,
      logger,
      eventBufferOptions: { bufferMs: 1, eventOrderer: () => -1 },
      syncOptions: defaultSyncOptions,
    });
    new StreamFactory({
      ably,
      logger,
      eventBufferOptions: defaultEventBufferOptions,
      syncOptions: { historyPageSize: 1, messageRetentionPeriod: '2m' },
    });
  });

  it<StreamTestContext>('fails with lt zero event buffer ms', async ({ ably, logger }) => {
    try {
      new StreamFactory({
        ably,
        logger,
        eventBufferOptions: { bufferMs: -1, eventOrderer: numericOtherwiseLexicographicOrderer },
        syncOptions: defaultSyncOptions,
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err.toString(), 'Stream registry should have thrown an error').not.toContain('AssertionError');
    }
  });

  it<StreamTestContext>('fails with zero history page size', async ({ ably, logger }) => {
    try {
      new StreamFactory({
        ably,
        logger,
        eventBufferOptions: defaultEventBufferOptions,
        syncOptions: { historyPageSize: 0, messageRetentionPeriod: '2m' },
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err.toString(), 'Stream registry should have thrown an error').not.toContain('AssertionError');
    }
  });

  it<StreamTestContext>('fails with lt zero history page size', async ({ ably, logger }) => {
    try {
      new StreamFactory({
        ably,
        logger,
        eventBufferOptions: defaultEventBufferOptions,
        syncOptions: { historyPageSize: -1, messageRetentionPeriod: '2m' },
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err.toString(), 'Stream registry should have thrown an error').not.toContain('AssertionError');
    }
  });
});
