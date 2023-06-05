import { it, describe, expect, expectTypeOf, beforeEach, afterEach } from 'vitest';
import { Realtime, Types } from 'ably/promises';
import { WebSocket } from 'mock-socket';

import Model from './Model';
import Stream from './Stream';

import Server from './utilities/test/mock-server.js';
import defaultClientConfig from './utilities/test/default-client-config.js';

interface ModelTestContext {
  client: Types.RealtimePromise;
  server: Server;
}

describe('Model', () => {
  beforeEach<ModelTestContext>((context) => {
    (Realtime as any).Platform.Config.WebSocket = WebSocket;
    context.server = new Server('wss://realtime.ably.io/');
    context.client = new Realtime(defaultClientConfig);
  });

  afterEach<ModelTestContext>((context) => {
    context.server.stop();
  });

  it<ModelTestContext>('connects successfully with the Ably Client', async ({ client, server }) => {
    server.start();
    const connectSuccess = await client.connection.whenState('connected');
    expect(connectSuccess.current).toBe('connected');
  });

  it<ModelTestContext>('expects the injected client to be of the type RealtimePromise', ({ client }) => {
    const model = new Model('test', client);
    expect(model.name).toEqual('test');
    expectTypeOf(model.client).toMatchTypeOf<Types.RealtimePromise>();
  });

  it<ModelTestContext>('expects model to be instantiated with the provided event streams', ({ client }) => {
    const model = new Model('test', client, {
      streams: [new Stream('s1', client, { channel: 's1' }), new Stream('s2', client, { channel: 's2' })],
    });
    expect(model.name).toEqual('test');
    expect(model.stream('s1')).toBeTruthy();
    expect(model.stream('s1').name).toEqual('s1');
    expect(model.stream('s2')).toBeTruthy();
    expect(model.stream('s2').name).toEqual('s2');
    expect(() => model.stream('s3')).toThrowError("stream with name 's3' not registered on model 'test'");
  });
});
