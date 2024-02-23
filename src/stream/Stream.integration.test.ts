import { Realtime, Types } from 'ably/promises';
import pino from 'pino';
import { it, describe, expect, beforeEach, afterEach } from 'vitest';

import Stream from './Stream.js';
import { defaultSyncOptions, defaultEventBufferOptions } from '../Options.js';
import type { StreamOptions } from '../types/stream.js';
import { createAblyApp } from '../utilities/test/createAblyApp.js';

interface StreamTestContext extends StreamOptions {
  stream: Stream;
  channel: Types.RealtimeChannelPromise;
}

describe('Stream integration', () => {
  beforeEach<StreamTestContext>(async (context) => {
    const name = 'test';
    const data = await createAblyApp({
      keys: [{}],
      namespaces: [{ id: name, persisted: true }],
      channels: [
        {
          name,
          presence: [
            { clientId: 'John', data: 'john@test.com' },
            { clientId: 'Dave', data: 'dave@test.com' },
          ],
        },
      ],
    });
    const ably = new Realtime({
      key: data.keys[0].keyStr,
      environment: 'sandbox',
    });
    const logger = pino({ level: 'silent' });
    const channel = ably.channels.get(name);
    const stream = new Stream({
      ably,
      logger,
      channelName: name,
      syncOptions: defaultSyncOptions,
      eventBufferOptions: defaultEventBufferOptions,
    });

    context.stream = stream;
    context.channel = channel;
  });

  afterEach<StreamTestContext>(async ({ stream, channel }) => {
    await stream.dispose();
    await channel.detach();
  });

  it<StreamTestContext>('sets agent options when state is not attached', async ({ channel, stream }) => {
    await stream.replay('0');
    //@ts-ignore - `agent` is filtered out in `channel.params`, so that's the only way to check this
    expect(channel.channelOptions.params).toEqual({ agent: 'models/0.0.2' }); // initial call from test
  });

  it<StreamTestContext>('does not sets agent options when state is attached', async ({ channel }) => {
    await channel.attach();
    //@ts-ignore - `agent` is filtered out in `channel.params`, so that's the only way to check this
    expect(channel.channelOptions.params).toEqual(undefined); // initial call from test
  });
});
