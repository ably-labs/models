import pino, { LevelWithSilent } from 'pino';

import Model from './Model.js';
import { defaultEventBufferOptions, defaultOptimisticEventOptions, defaultSyncOptions } from './Options.js';
import type { OptionalFields, OptionalValues } from './types/helpers.js';
import type { ModelOptions, Registration } from './types/model.js';
import type { OptimisticEventOptions, SyncOptions } from './types/optimistic.js';
import type { EventBufferOptions } from './types/stream.js';

type registration<T> = { name: string; channelName: string } & Registration<T>;

export type ModelsOptions = OptionalValues<
  OptionalFields<
    Omit<ModelOptions, 'logger' | 'channelName'> & { logLevel?: LevelWithSilent },
    'optimisticEventOptions' | 'eventBufferOptions' | 'syncOptions'
  >,
  'optimisticEventOptions' | 'eventBufferOptions' | 'syncOptions'
>;

/**
 * ModelsClient captures the set of named Model instances used by your application.
 * And provides methods to construct a new model.
 */
export default class ModelsClient {
  private opts: Omit<ModelOptions, 'channelName'>;
  private modelInstances: Record<string, Model<any>> = {};

  readonly version = '0.0.1';

  /**
   * @param {ModelOptions} options - Options used to configure all models instantiated here, including the underlying Ably client.
   */
  constructor(private readonly options: ModelsOptions) {
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
    this.options.ably.time();
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
       * @param {registration} registration - The name, channelName, sync and merge functions for this model.
       * The names and funcitons will be automatically setup on the model returned.
       * The model will not start until you call model.sync()
       */
      get: <T>(registration: registration<T>) => {
        const name = registration.name;
        const channelName = registration.channelName;

        if (!name) {
          throw new Error('Model must have a non-empty name');
        }

        if (this.modelInstances[name]) {
          return this.modelInstances[name] as Model<T>;
        }

        const model = new Model<T>(name, registration, { ...this.opts, channelName });
        this.modelInstances[name] = model;
        return model as Model<T>;
      },
    };
  }
}
