import type { Types } from 'ably/promises';
import Model, { ModelOptions } from './Model.js';
import pino, { LevelWithSilent, Logger } from 'pino';
import { MutationMethods } from './Mutations.js';

export type ModelsOptions = {
  ably: Types.RealtimePromise;
  logLevel?: LevelWithSilent;
};

type AnyModel = Model<any, any>;
type ModelsRecord = {
  [K in keyof AnyModel]: AnyModel[K] extends Model<infer T, infer M> ? Model<T, M> : never;
};

class Models {
  public ably: Types.RealtimePromise;
  private logger: Logger;
  private models: Partial<ModelsRecord> = {};

  readonly version = '0.0.1';

  constructor(options: ModelsOptions) {
    this.models = {};
    this.ably = options.ably;
    this.logger = pino({ level: options.logLevel || 'silent' });
    this.ably.time();
  }

  Model = <T, M extends MutationMethods>(name: string, options: Omit<ModelOptions<T>, 'ably' | 'logger'>) => {
    if (!name) {
      throw new Error('Model must have a non-empty name');
    }
    if (this.models[name]) {
      return this.models[name] as Model<T, M>;
    }
    const model = new Model<T, M>(name, { ably: this.ably, logger: this.logger, ...options });
    this.models[name] = model;
    return model as Model<T, M>;
  };
}

export default Models;
