import { it, describe, expect, expectTypeOf, beforeEach, afterEach } from 'vitest';
import { Realtime, Types } from 'ably/promises';
import { WebSocket } from 'mock-socket';

import Models from './Models';

import Server from './utilities/test/mock-server.js';
import defaultClientConfig from './utilities/test/default-client-config.js';

interface ModelsTestContext {
  client: Types.RealtimePromise;
  server: Server;
}

describe('Models', () => {
  beforeEach<ModelsTestContext>((context) => {
    (Realtime as any).Platform.Config.WebSocket = WebSocket;
    context.server = new Server('wss://realtime.ably.io/');
    context.client = new Realtime(defaultClientConfig);
  });

  afterEach<ModelsTestContext>((context) => {
    context.server.stop();
  });

  it<ModelsTestContext>('connects successfully with the Ably Client', async ({ client, server }) => {
    server.start();
    const connectSuccess = await client.connection.whenState('connected');
    expect(connectSuccess.current).toBe('connected');
  });

  it<ModelsTestContext>('expects the injected client to be of the type RealtimePromise', ({ client }) => {
    const models = new Models(client);
    expectTypeOf(models.ably).toMatchTypeOf<Types.RealtimePromise>();
  });

  it<ModelsTestContext>('creates a client with default options when a key is passed in', () => {
    const models = new Models(defaultClientConfig.key);
    expect(models.ably['options'].key).toEqual(defaultClientConfig.key);
  });

  it<ModelsTestContext>('creates a client with options that are passed in', () => {
    const models = new Models({ ...defaultClientConfig });
    expect(models.ably['options']).toContain(defaultClientConfig);
  });

  it<ModelsTestContext>('applies the agent header to an existing SDK instance', ({ client }) => {
    const models = new Models(client);
    expect((client as any).options.agents).toEqual([`ably-models/${models.version}`, 'model-custom-client']);
  });

  it<ModelsTestContext>('applies the agent header when options are passed in', () => {
    const models = new Models(defaultClientConfig);
    expect(models.ably['options'].agents).toEqual([`ably-models/${models.version}`, 'model-default-client']);
  });

  it<ModelsTestContext>('extend the agents array when it already exists', () => {
    const models = new Models({
      ...defaultClientConfig,
      agents: ['some-client/1.2.3'],
    } as any);
    expect(models.ably['options'].agents).toEqual([
      'some-client/1.2.3',
      `ably-models/${models.version}`,
      'model-default-client',
    ]);
  });

  it<ModelsTestContext>('creates a model that inherits the root class ably client', () => {
    const models = new Models({ ...defaultClientConfig });
    const model = models.Model('test');
    expect(model.name).toEqual('test');
    expect(model.client['options']).toContain(defaultClientConfig);
  });

  it<ModelsTestContext>('getting a model with the same name returns the same instance', () => {
    const models = new Models({ ...defaultClientConfig });
    const model1 = models.Model('test');
    expect(model1.name).toEqual('test');
    const model2 = models.Model('test');
    expect(model2.name).toEqual('test');
    expect(model1).toEqual(model2);
  });

  it<ModelsTestContext>('creates an event stream that inherits the root class ably client', () => {
    const models = new Models({ ...defaultClientConfig });
    const eventStream = models.EventStream('test', { channel: 'foobar' });
    expect(eventStream.name).toEqual('test');
    expect(eventStream.client['options']).toContain(defaultClientConfig);
  });

  it<ModelsTestContext>('getting an event stream without options throws', () => {
    const models = new Models({ ...defaultClientConfig });
    expect(() => models.EventStream('test')).toThrow('EventStream cannot be instantiated without options');
  });

  it<ModelsTestContext>('getting an event stream with the same name returns the same instance', () => {
    const models = new Models({ ...defaultClientConfig });
    const eventStream1 = models.EventStream('test', { channel: 'foobar' }); // first call requires options to instantiate
    expect(eventStream1.name).toEqual('test');
    const eventStream2 = models.EventStream('test'); // subsequent calls do not require options
    expect(eventStream2.name).toEqual('test');
    expect(eventStream1).toEqual(eventStream2);
    const eventStream3 = models.EventStream('test', { channel: 'barbaz' }); // providing options to subsequent calls is allowed but ignored
    expect(eventStream3.name).toEqual('test');
    expect(eventStream1).toEqual(eventStream3);
  });
});
