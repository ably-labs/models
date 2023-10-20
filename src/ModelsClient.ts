import pino from 'pino';

import Model from './Model.js';
import type { ModelsOptions, ModelOptions } from './types/model.js';
import { Registration } from './types/model.js';

type registration<T> = { name: string; channelName: string } & Registration<T>;

/**
 * ModelsClient captures the set of named Model instances used by your application.
 * And provides methods to construct a new model.
 */
export default class ModelsClient {
  private readonly options: Pick<ModelOptions, 'logger' | 'ably' | 'eventBufferOptions' | 'defaultOptimisticOptions'>;
  private modelInstances: Record<string, Model<any>> = {};

  readonly version = '0.0.1';

  /**
   * @param {ModelOptions} options - Options used to configure all models instantiated here, including the underlying Ably client.
   */
  constructor(options: ModelsOptions) {
    this.modelInstances = {};
    this.options = {
      logger: pino({ level: options.logLevel || 'silent' }),
      ably: options.ably,
      ...(options.defaultOptimisticOptions && { defaultOptimisticOptions: options.defaultOptimisticOptions }),
      eventBufferOptions: options.eventBufferOptions,
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

        const options: ModelOptions = { ...this.options, channelName: channelName };

        const model = new Model<T>(name, registration, options);

        this.modelInstances[name] = model;
        return model as Model<T>;
      },
    };
  }
}
