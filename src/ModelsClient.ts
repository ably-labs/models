import { Types as AblyTypes } from 'ably';
import pino from 'pino';

import Model from './Model.js';
import { defaultEventBufferOptions, defaultOptimisticEventOptions, defaultSyncOptions } from './Options.js';
import type { ModelsOptions, ModelOptions, ModelSpec, SyncFuncConstraint } from './types/model.js';
import type { OptimisticEventOptions, SyncOptions } from './types/optimistic.js';
import type { EventBufferOptions } from './types/stream.js';
import { VERSION } from './version.js';

interface AblyClientWithOptions extends AblyTypes.RealtimePromise {
  options?: {
    agents?: Record<string, string | boolean>;
  };
}

/**
 * ModelsClient captures the set of named Model instances used by your application.
 * And provides methods to construct a new model.
 */
export default class ModelsClient {
  private opts: Omit<ModelOptions, 'channelName'>;
  private modelInstances: Record<string, Model<any>> = {};

  /**
   * @param {ModelsOptions} options - Options used to configure all models instantiated here, including the underlying Ably client.
   */
  constructor(private readonly options: ModelsOptions) {
    if (!this.isModelsOptions(options)) {
      throw new Error('expected options to be a ModelsOptions');
    }

    this.modelInstances = {};
    const optimisticEventOptions: OptimisticEventOptions = Object.assign(
      {},
      defaultOptimisticEventOptions,
      this.options.optimisticEventOptions,
    );
    const eventBufferOptions: EventBufferOptions = Object.assign(
      {},
      defaultEventBufferOptions,
      this.options.eventBufferOptions,
    );
    const syncOptions: SyncOptions = Object.assign({}, defaultSyncOptions, this.options.syncOptions);
    this.opts = {
      logger: pino({ level: options.logLevel || 'silent' }),
      ably: options.ably,
      syncOptions,
      optimisticEventOptions,
      eventBufferOptions,
    };
    this.addAgent(this.opts.ably as AblyClientWithOptions);
    this.options.ably.time();
  }

  private addAgent(client: AblyClientWithOptions) {
    const agent = { models: VERSION };
    if (!client['options']) {
      client['options'] = {};
    }
    client['options'].agents = { ...client['options'].agents, ...agent };
  }

  /**
   * @returns {Types.RealtimePromise} The Ably client shared by all models.
   */
  get ably() {
    return this.options.ably;
  }

  get models() {
    return {
      /**
       * Gets an existing or creates a new model instance with the given name.
       * @param {ModelSpec} spec - The name, channelName, sync and merge functions for this model.
       * The names and funcitons will be automatically setup on the model returned.
       * The model will not start until you call model.sync() or model.subscribe()
       */
      get: <S extends SyncFuncConstraint>(spec: ModelSpec<S>) => {
        if (!this.isModelSpec<S>(spec)) {
          throw new Error('expected spec to be a ModelSpec');
        }

        const name = spec.name;
        const channelName = spec.channelName;

        if (!name) {
          throw new Error('Model must have a non-empty name');
        }

        if (this.modelInstances[name]) {
          return this.modelInstances[name] as Model<S>;
        }

        const model = new Model<S>(name, spec, { ...this.opts, channelName });
        this.modelInstances[name] = model;

        return model as Model<S>;
      },
    };
  }

  isModelsOptions(options: any): options is ModelsOptions {
    return options && typeof options.ably === 'object';
  }

  isModelSpec<S extends SyncFuncConstraint>(spec: any): spec is ModelSpec<S> {
    return (
      spec &&
      spec.name &&
      typeof spec.name === 'string' &&
      spec.channelName &&
      typeof spec.channelName === 'string' &&
      spec.sync &&
      typeof spec.sync === 'function' &&
      spec.merge &&
      typeof spec.merge === 'function'
    );
  }
}
