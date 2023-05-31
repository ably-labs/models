import { it, describe, expect, expectTypeOf, beforeEach, afterEach } from 'vitest';
import { Realtime, Types } from 'ably/promises';
import { WebSocket } from 'mock-socket';

import EventStream from './EventStream';

import Server from './utilities/test/mock-server.js';
import defaultClientConfig from './utilities/test/default-client-config.js';

interface EventStreamTestContext {
  client: Types.RealtimePromise;
  server: Server;
}

describe('EventStream', () => {
  beforeEach<EventStreamTestContext>((context) => {
    (Realtime as any).Platform.Config.WebSocket = WebSocket;
    context.server = new Server('wss://realtime.ably.io/');
    context.client = new Realtime(defaultClientConfig);
  });

  afterEach<EventStreamTestContext>((context) => {
    context.server.stop();
  });

  it<EventStreamTestContext>('connects successfully with the Ably Client', async ({ client, server }) => {
    server.start();
    const connectSuccess = await client.connection.whenState('connected');
    expect(connectSuccess.current).toBe('connected');
  });

  it<EventStreamTestContext>('expects the injected client to be of the type RealtimePromise', ({ client }) => {
    const eventStream = new EventStream('test', client, { channel: 'foobar' });
    expect(eventStream.name).toEqual('test');
    expectTypeOf(eventStream.client).toMatchTypeOf<Types.RealtimePromise>();
  });
});
