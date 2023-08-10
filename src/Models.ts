import type { Types } from 'ably/promises';
import Model, { ModelOptions } from './Model.js';
import pino, { LevelWithSilent } from 'pino';
import { MutationMethods } from './MutationsRegistry.js';

export type ModelsOptions = {
  ably: Types.RealtimePromise;
  logLevel?: LevelWithSilent;
};

/**
 * Models captures the set of named Model instances used by your application.
 */
export default class Models {
  private readonly options: ModelOptions;
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
    };
    this.options.ably.time();
  }

  /**
   * @returns {Types.RealtimePromise} The Ably client shared by all models and registered via the {@link ModelsOptions}.
   */
  get ably() {
    return this.options.ably;
  }

  /**
   * Gets an existing or creates a new model instance with the given name.
   * @param {string} name - The unique name to identify this model instance in your application.
   */
  Model = <T, M extends MutationMethods>(name: string) => {
    if (!name) {
      throw new Error('Model must have a non-empty name');
    }
    if (this.models[name]) {
      return this.models[name] as Model<T, M>;
    }
    const model = new Model<T, M>(name, this.options);
    this.models[name] = model;
    return model as Model<T, M>;
  };
}
