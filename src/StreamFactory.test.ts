import { Realtime, Types } from 'ably/promises';
import pino from 'pino';
import { it, describe, expect, beforeEach, afterEach, vi } from 'vitest';

import { type StreamOptions } from './Stream.js';
import StreamFactory from './StreamFactory.js';

vi.mock('ably/promises');

interface StreamTestContext extends StreamOptions {
  ablyChannel: Types.RealtimeChannelPromise;
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

    const channel = ably.channels.get('foobar');
    channel.on = vi.fn<any, any>(); // all tests call `channel.on('fail')`

    context.ably = ably;
    context.logger = pino({ level: 'silent' });
    context.ablyChannel = channel;
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
