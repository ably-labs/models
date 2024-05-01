import { Realtime } from 'ably';
import pino from 'pino';

import { InvalidArgumentError } from './Errors.js';
import Model from './Model.js';
import { defaultEventBufferOptions, defaultOptimisticEventOptions, defaultSyncOptions } from './Options.js';
import type { ModelsOptions, ModelOptions, ModelSpec, SyncFuncConstraint } from './types/model.js';
import type { OptimisticEventOptions, SyncOptions } from './types/optimistic.js';
import type { EventBufferOptions } from './types/stream.js';
import { VERSION } from './version.js';

interface AblyClientWithOptions extends Realtime {
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
   * Constructs a new ModelsClient instance.
   * @param {ModelsOptions} options - Options used to configure all models instantiated here, including the underlying Ably client.
   */
  constructor(private readonly options: ModelsOptions) {
    if (!this.isModelsOptions(options)) {
      throw new InvalidArgumentError('expected options to be a ModelsOptions');
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

  /**
   * Namespace for getting an existing model instance or creating a new model instance.
   * @returns {Object} An object with a get method for getting an existing model instance or creating a new model instance.
   */
  get models() {
    return {
      /**
       * Gets an existing or creates a new model instance with the given name.
       * @template S - The sync function type.
       * @param {ModelSpec} spec - The channelName, sync and merge functions for this model.
       * The name and funcitons will be automatically setup on the model returned.
       * The model will not start until you call model.sync() or model.subscribe()
       * @returns {Model} The model instance.
       */
      get: <S extends SyncFuncConstraint>(spec: ModelSpec<S>) => {
        if (!this.isModelSpec<S>(spec)) {
          throw new InvalidArgumentError('expected spec to be a ModelSpec');
        }

        const channelName = spec.channelName;

        if (!channelName) {
          throw new InvalidArgumentError('Model must have a non-empty channel name');
        }

        if (this.modelInstances[channelName]) {
          return this.modelInstances[channelName] as Model<S>;
        }

        const model = new Model<S>(channelName, spec, { ...this.opts, channelName });
        this.modelInstances[channelName] = model;

        return model as Model<S>;
      },
    };
  }

  private isModelsOptions(options: any): options is ModelsOptions {
    return options && typeof options.ably === 'object';
  }

  private isModelSpec<S extends SyncFuncConstraint>(spec: any): spec is ModelSpec<S> {
    return (
      spec &&
      spec.channelName &&
      typeof spec.channelName === 'string' &&
      spec.sync &&
      typeof spec.sync === 'function' &&
      spec.merge &&
      typeof spec.merge === 'function'
    );
  }
}
