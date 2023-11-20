import type { Types as AblyTypes } from 'ably/promises';
import { fromUint8Array, toUint8Array } from 'js-base64';
import * as Y from 'yjs';

import Model from './Model.js';
import ModelsClient from './ModelsClient.js';
import { OptimisticEvent, ConfirmedEvent } from './types/model.js';
import EventEmitter from './utilities/EventEmitter.js';

type ProviderBootstrapFunc = (doc: Y.Doc) => Promise<{ serverStateVector: Uint8Array; serverUpdate: Uint8Array }>;

export type ProviderOptions = {
  ably: AblyTypes.RealtimePromise;
  sendChannel: string;
  receiveChannel: string;
  bootstrap: ProviderBootstrapFunc;
};

type YJsModelStateType = { ydoc: Y.Doc; serverStateVector: Uint8Array };

type ModelSyncFunc = (doc: Y.Doc) => Promise<{ data: YJsModelStateType; sequenceID: string }>;

export default class AblyProvider extends EventEmitter<Record<string, string>> {
  private ably: AblyTypes.RealtimePromise;
  private client: ModelsClient;
  model: Model<ModelSyncFunc>;

  private sendChannel: AblyTypes.RealtimeChannelPromise;

  constructor(readonly doc: Y.Doc, options: ProviderOptions) {
    super();
    this.ably = options.ably;
    this.client = new ModelsClient({ ably: options.ably });
    this.sendChannel = options.ably.channels.get(options.sendChannel);

    this.model = this.client.models.get({
      name: 'yjs:' + doc.guid,
      channelName: options.receiveChannel,
      sync: yjsSyncAdaptor(options.bootstrap, this.sendChannel, this.ably.clientId),
      merge: yjsDefaultMerge,
    });

    doc.on('update', (update, origin) => {
      if (origin === 'server') {
        return;
      }

      this.sendChannel.publish('update', { update: fromUint8Array(update), origin: origin || this.ably.clientId });
    });

    this.model.sync(doc);
    this.model.on('ready', () => {
      this.emit('ready', 'ready');
    });
  }
}

const yjsSyncAdaptor = function (
  fn: ProviderBootstrapFunc,
  send: AblyTypes.RealtimeChannelPromise,
  origin: string,
): (doc: Y.Doc) => Promise<{ data: YJsModelStateType; sequenceID: string }> {
  return async (doc) => {
    const { serverStateVector, serverUpdate } = await fn(doc);

    if (serverUpdate.length > 0) {
      Y.applyUpdate(doc, serverUpdate, 'server');
    }

    if (serverStateVector.length > 0) {
      const update = Y.encodeStateAsUpdate(doc, serverStateVector);
      send.publish('sync', { update: fromUint8Array(update), origin: origin });
    }

    return Promise.resolve({
      data: { ydoc: doc, serverStateVector: serverStateVector },
      sequenceID: '',
    });
  };
};

/*
 * This merge function is a default for merging an update into a YDoc
 */
const yjsDefaultMerge = async (state: YJsModelStateType, event: OptimisticEvent | ConfirmedEvent) => {
  if (!event.confirmed) {
    return state;
  }

  if (event.name !== 'update') {
    return state;
  }

  const data = JSON.parse(event.data) as { update: string; origin: string };
  const yUpdate = toUint8Array(data.update);
  Y.applyUpdate(state.ydoc, yUpdate, data.origin || 'server');
  return state;
};
