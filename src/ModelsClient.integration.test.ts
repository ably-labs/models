import { Realtime } from 'ably/promises';
import { it, describe, expect, beforeEach, vi } from 'vitest';

import ModelsClient from './ModelsClient.js';
import { createAblyApp } from './utilities/test/createAblyApp.js';

interface ModelsTestContext {
  modelsClient: ModelsClient;
  channelName: string;
}

describe('ModelsClients integration', () => {
  beforeEach<ModelsTestContext>(async (context) => {
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
    const ably = new Realtime.Promise({
      key: data.keys[0].keyStr,
      environment: 'sandbox',
    });

    const modelsClient = new ModelsClient({ ably, logLevel: 'debug' });

    context.modelsClient = modelsClient;
    context.channelName = name;
  });

  it<ModelsTestContext>('shows no erros when there is a racing condition between subscribe and unsubscribe', async ({
    modelsClient,
    channelName,
  }) => {
    const model = modelsClient.models.get({
      name: channelName,
      channelName,
      sync: async (x) => await new Promise((resolve) => setTimeout(() => resolve(x), 500)),
      merge: vi.fn(),
    });

    expect(model.state).toBe('initialized');
    model.subscribe(vi.fn());
    expect(model.state).toBe('syncing');
    await model.sync('1');
    model.unsubscribe(vi.fn());
    expect(model.state).toBe('ready');
    model.subscribe(vi.fn());
    await model.sync('1');
    setTimeout(() => model.unsubscribe(vi.fn()), 300);
    model.subscribe(vi.fn());
    model.dispose();

    expect(model.state).toBe('disposed');
  });
});
