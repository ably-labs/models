import type { Types } from 'ably/promises';
import Model, { ModelOptions } from './Model.js';
import pino, { LevelWithSilent } from 'pino';
import { MutationMethods } from './MutationsRegistry.js';

export type ModelsOptions = {
  ably: Types.RealtimePromise;
  logLevel?: LevelWithSilent;
};

type AnyModel = Model<any, any>;
type ModelsRecord = {
  [K in keyof AnyModel]: AnyModel[K] extends Model<infer T, infer M> ? Model<T, M> : never;
};

class Models {
  private options: ModelOptions;
  private models: Partial<ModelsRecord> = {};

  readonly version = '0.0.1';

  constructor(options: ModelsOptions) {
    this.models = {};
    this.options = {
      logger: pino({ level: options.logLevel || 'silent' }),
      ably: options.ably,
    };
    this.options.ably.time();
  }

  get ably() {
    return this.options.ably;
  }

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

export default Models;
