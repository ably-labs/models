import { it, describe, expect, expectTypeOf, beforeEach, afterEach } from 'vitest';
import { Realtime, Types } from 'ably/promises';
import { WebSocket } from 'mock-socket';

import Models from './Models.js';

import Server from './utilities/test/mock-server.js';
import defaultClientConfig from './utilities/test/default-client-config.js';

interface ModelsTestContext {
  ably: Types.RealtimePromise;
  server: Server;
}

describe('Models', () => {
  beforeEach<ModelsTestContext>((context) => {
    (Realtime as any).Platform.Config.WebSocket = WebSocket;
    context.server = new Server('wss://realtime.ably.io/');
    context.ably = new Realtime(defaultClientConfig);
  });

  afterEach<ModelsTestContext>((context) => {
    context.server.stop();
  });

  it<ModelsTestContext>('connects successfully with the Ably Client', async ({ ably, server }) => {
    server.start();
    const connectSuccess = await ably.connection.whenState('connected');
    expect(connectSuccess.current).toBe('connected');
  });

  it<ModelsTestContext>('expects the injected client to be of the type RealtimePromise', ({ ably }) => {
    const models = new Models({ ably });
    expectTypeOf(models.ably).toMatchTypeOf<Types.RealtimePromise>();
  });

  it<ModelsTestContext>('getting a model with the same name returns the same instance', ({ ably }) => {
    const models = new Models({ ably });
    const model1 = models.Model<string>('test', {
      sync: async () => ({ version: 1, data: 'foobar' }),
    });
    expect(model1.name).toEqual('test');
    const model2 = models.Model<string>('test', {
      sync: async () => ({ version: 1, data: 'foobar' }),
    });
    expect(model2.name).toEqual('test');
    expect(model1).toEqual(model2);
  });
});
