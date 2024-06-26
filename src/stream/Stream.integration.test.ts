import { Realtime, RealtimeChannel } from 'ably';
import pino from 'pino';
import { it, describe, expect, beforeEach, afterEach } from 'vitest';

import Stream from './Stream.js';
import { defaultSyncOptions, defaultEventBufferOptions } from '../Options.js';
import type { StreamOptions } from '../types/stream.js';
import { createAblyApp } from '../utilities/test/createAblyApp.js';
import { VERSION } from '../version.js';

interface StreamTestContext extends StreamOptions {
  stream: Stream;
  channel: RealtimeChannel;
}

describe('Stream integration', () => {
  beforeEach<StreamTestContext>(async (context) => {
    const name = 'test';
    const data = await createAblyApp({
      keys: [{}],
      namespaces: [],
      channels: [
        {
          name,
          presence: [],
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
    expect(channel.channelOptions.params).toEqual({ agent: `models/${VERSION}` }); // initial call from test
  });

  it<StreamTestContext>('does not sets agent options when state is attached', async ({ channel }) => {
    await channel.attach();
    //@ts-ignore - `agent` is filtered out in `channel.params`, so that's the only way to check this
    expect(channel.channelOptions.params).toEqual(undefined); // initial call from test
  });
});
