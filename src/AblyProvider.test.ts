import { Realtime, Types as AblyTypes } from 'ably/promises';
import { fromUint8Array, toUint8Array } from 'js-base64';
import { Subject } from 'rxjs';
import { it, describe, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';

import AblyProvider from './AblyProvider.js';
import { customMessage } from './utilities/test/messages.js';

vi.mock('ably/promises');

interface ProviderTestContext {
  ably: AblyTypes.RealtimePromise;
  sendChannel: any;
  receiveChannel: any;
}

describe('AblyProvider', () => {
  beforeEach<ProviderTestContext>((context) => {
    const ably = new Realtime({});
    context.ably = ably;
    const sendChannel = {
      on: vi.fn<any, any>(),
      publish: vi.fn<any, any>(),
      attach: vi.fn<any, any>(),
      detach: vi.fn<any, any>(),
    };
    const receiveChannel = {
      on: vi.fn<any, any>(),
      attach: vi.fn<any, any>(),
      detach: vi.fn<any, any>(),
      subscribe: vi.fn<any, any>(),
      history: vi.fn<any, any>(),
    };
    receiveChannel.history = vi.fn<any, any>(
      async (): Promise<Partial<AblyTypes.PaginatedResult<Types.Message>>> => ({
        items: [],
        hasNext: () => false,
      }),
    );

    context.sendChannel = sendChannel;
    context.receiveChannel = receiveChannel;

    context.ably.channels.get = vi.fn<any, any>((name: string) => {
      if (name.startsWith('send')) {
        return context.sendChannel;
      }

      return context.receiveChannel;
    });
    context.ably.channels.release = vi.fn<any, any>();

    ably.connection.whenState = vi.fn<[AblyTypes.ConnectionState], Promise<AblyTypes.ConnectionStateChange>>(
      async () => {
        return {
          current: 'connected',
          previous: 'initialized',
        };
      },
    );

    context.sendChannel = sendChannel;
    context.receiveChannel = receiveChannel;
  });

  it<ProviderTestContext>('sends updates', (context) => {
    const clientId = 'abc123';
    context.ably.clientId = clientId;

    const sendChannel = context.sendChannel;

    const provider = new AblyProvider(new Y.Doc(), {
      ably: context.ably,
      sendChannel: 'sendChannel',
      receiveChannel: 'receiveChannel',
      bootstrap: exampleBootstrapFunction,
    });

    provider.doc.getMap('mymap').set('field', 'value');

    expect(sendChannel.publish).toHaveBeenCalledTimes(1);
    const update = sendChannel.publish.mock.calls[0][1].update;
    expect(sendChannel.publish).toHaveBeenCalledWith('update', { update: update, origin: clientId });

    const yUpdate = toUint8Array(update);
    const got = new Y.Doc();
    Y.applyUpdate(got, yUpdate);
    expect(got.getMap('mymap').get('field')).toEqual('value');
  });

  it<ProviderTestContext>('applies updates', async (context) => {
    const clientId = 'foobarbaz';
    context.ably.clientId = clientId;
    const remoteDoc = new Y.Doc();

    let updates = new Subject<AblyTypes.Message>();
    context.receiveChannel.subscribe = vi.fn<any, any>(async (callback) => {
      updates.subscribe((update) => {
        callback(update);
      });
      return {
        current: 'attached',
        previous: 'attaching',
        resumed: false,
        hasBacklog: false,
      };
    });

    // When a change is applied to the 'remoteDoc', that change
    // becomes a channel message on the 'updates' subject, and applied
    // to the local YDoc.
    remoteDoc.on('update', (update, origin) => {
      updates.next(customMessage('1', 'update', JSON.stringify({ update: fromUint8Array(update), origin: origin })));
    });

    const provider = new AblyProvider(new Y.Doc(), {
      ably: context.ably,
      sendChannel: 'sendChannel',
      receiveChannel: 'receiveChannel',
      bootstrap: exampleBootstrapFunction,
    });
    await new Promise<void>((resolve) => {
      provider.whenState('ready', '', () => {
        resolve();
      });
    });
    const localUpdateReceived = new Promise((resolve) => {
      provider.doc.on('update', (update, origin) => {
        resolve(origin);
      });
    });

    // Change the 'remoteDoc', update should be propagated to local YDoc
    remoteDoc.getMap('mymap').set('field', 'value');

    // Wait for local update to be received
    const origin = await localUpdateReceived;
    expect(origin).toEqual('server');
    expect(provider.doc.getMap('mymap').get('field')).toEqual('value');
  });
});

const exampleBootstrapFunction = async () => {
  return { serverStateVector: Uint8Array.of(), serverUpdate: Uint8Array.of() };
};
