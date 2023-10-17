import { Realtime, Types } from 'ably/promises';
import { vi, it, describe, expect, expectTypeOf, beforeEach } from 'vitest';

import Models from './Models.js';

interface ModelsTestContext {
  ably: Types.RealtimePromise;
  channelName: string;
}

vi.mock('ably/promises');

describe('Models', () => {
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
    const models = new Models({ ably });
    expectTypeOf(models.ably).toMatchTypeOf<Types.RealtimePromise>();
  });

  it<ModelsTestContext>('getting a model with the same name returns the same instance', ({ ably, channelName }) => {
    const models = new Models({ ably });
    const model1 = models.Model<string>('test', channelName);
    expect(model1.name).toEqual('test');
    const model2 = models.Model<string>('test', channelName);
    expect(model2.name).toEqual('test');
    expect(model1).toEqual(model2);
  });
});
