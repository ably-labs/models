import { Realtime, Types } from 'ably/promises';
import { vi, it, describe, expect, expectTypeOf, beforeEach } from 'vitest';

import ModelsClient from './ModelsClient.js';

interface ModelsTestContext {
  ably: Types.RealtimePromise;
  channelName: string;
}

vi.mock('ably/promises');

describe('ModelsClient', () => {
  beforeEach<ModelsTestContext>((context) => {
    context.ably = new Realtime({ key: 'abc:def' });
    context.channelName = 'models:myTestModel:updates';

    // make sure the various channel and connection
    // functions are mounted on the ably realtime mock
    const ablyChannel = context.ably.channels.get(context.channelName);
    ablyChannel.on = vi.fn<any, any>();
    ablyChannel.subscribe = vi.fn<any, any>();
    context.ably.connection.whenState = vi.fn<any, any>();
  });

  it<ModelsTestContext>('expects the injected client to be of the type RealtimePromise', ({ ably }) => {
    const modelsClient = new ModelsClient({ ably });
    expectTypeOf(modelsClient.ably).toMatchTypeOf<Types.RealtimePromise>();
  });

  it<ModelsTestContext>('getting a model with the same name returns the same instance', async ({
    ably,
    channelName,
  }) => {
    const modelsClient = new ModelsClient({ ably });
    const model1 = modelsClient.models.get<string, [number, string]>({
      name: 'test',
      channelName: channelName,
      sync: async (page, id) => {
        return { data: 'initial data', sequenceID: '0', page, id };
      },
      merge: async () => 'merged',
    });
    expect(model1.name).toEqual('test');

    const model2 = modelsClient.models.get<string, []>({
      name: 'test',
      channelName: channelName,
      sync: async () => ({ data: 'initial data', sequenceID: '0' }),
      merge: async () => 'merged',
    });
    expect(model2.name).toEqual('test');
    expect(model1).toEqual(model2);
  });
});
