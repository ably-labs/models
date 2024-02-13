import { Realtime } from 'ably/promises';
import pino from 'pino';
import { describe, vi, it } from 'vitest';

import Model from './Model.js';
import { defaultSyncOptions, defaultEventBufferOptions, defaultOptimisticEventOptions } from './Options.js';

describe('Model', () => {
  it('subscribes and unsubscribes without errors', async () => {
    const ably = new Realtime.Promise({ key: import.meta.env.VITE_ABLY_API_KEY });
    const model = new Model(
      'test',
      {
        sync: vi.fn(async () => {
          return {
            data: {
              foo: 'foobar',
              bar: {
                baz: 1,
              },
            },
            sequenceID: '0',
          };
        }),
        merge: (_event, data) => data,
      },
      {
        ably,
        channelName: 'models:myModelTest:events',
        logger: pino({ level: 'silent' }),
        syncOptions: defaultSyncOptions,
        optimisticEventOptions: defaultOptimisticEventOptions,
        eventBufferOptions: defaultEventBufferOptions,
      },
    );

    model.subscribe(vi.fn());
    model.subscribe(vi.fn());
    model.subscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.subscribe(vi.fn());
    model.subscribe(vi.fn());
    model.subscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.subscribe(vi.fn());
    model.subscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.subscribe(vi.fn());
    model.subscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.subscribe(vi.fn());
    model.subscribe(vi.fn());
    model.subscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.subscribe(vi.fn());
    model.subscribe(vi.fn());
    model.subscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.subscribe(vi.fn());
    model.subscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.subscribe(vi.fn());
    model.subscribe(vi.fn());
    model.unsubscribe(vi.fn());
    model.unsubscribe(vi.fn());
  });
});
