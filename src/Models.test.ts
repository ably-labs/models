import { vi, it, describe, expect, expectTypeOf, beforeEach } from 'vitest';
import { Realtime, Types } from 'ably/promises';

import Models from './Models.js';

interface ModelsTestContext {
  ably: Types.RealtimePromise;
}

vi.mock('ably/promises');

describe('Models', () => {
  beforeEach<ModelsTestContext>((context) => {
    context.ably = new Realtime({ key: 'abc:def' });
  });

  it<ModelsTestContext>('expects the injected client to be of the type RealtimePromise', ({ ably }) => {
    const models = new Models({ ably });
    expectTypeOf(models.ably).toMatchTypeOf<Types.RealtimePromise>();
  });

  it<ModelsTestContext>('getting a model with the same name returns the same instance', ({ ably }) => {
    const models = new Models({ ably });
    const model1 = models.Model<string, {}>('test');
    expect(model1.name).toEqual('test');
    const model2 = models.Model<string, {}>('test');
    expect(model2.name).toEqual('test');
    expect(model1).toEqual(model2);
  });
});
