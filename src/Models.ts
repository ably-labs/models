import pino from 'pino';

import Model from './Model.js';
import type { ModelsOptions, ModelOptions } from './types/model.js';
import type { MutationMethods } from './types/mutations.js';

/**
 * Models captures the set of named Model instances used by your application.
 */
export default class Models {
  private readonly options: Pick<ModelOptions, 'logger' | 'ably' | 'eventBufferOptions' | 'defaultMutationOptions'>;
  private models: Record<string, Model<any, any>> = {};

  readonly version = '0.0.1';

  /**
   * @param {ModelOptions} options - Options used to configure all models instantiated here, including the underlying Ably client.
   */
  constructor(options: ModelsOptions) {
    this.models = {};
    this.options = {
      logger: pino({ level: options.logLevel || 'silent' }),
      ably: options.ably,
      ...(options.defaultMutationOptions && { defaultMutationOptions: options.defaultMutationOptions }),
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

  /**
   * Gets an existing or creates a new model instance with the given name.
   * @param {string} name - The unique name to identify this model instance in your application.
   * @param {string} channel - The name of the channel the model will subscribe to update events on.
   */
  Model = <T, M extends MutationMethods>(name: string, channel: string) => {
    if (!name) {
      throw new Error('Model must have a non-empty name');
    }
    if (this.models[name]) {
      return this.models[name] as Model<T, M>;
    }

    const options: ModelOptions = { ...this.options, channelName: channel };

    const model = new Model<T, M>(name, options);
    this.models[name] = model;
    return model as Model<T, M>;
  };
}
