import type { Types } from 'ably/promises';
import Model, { ModelOptions } from './Model.js';
import pino, { LevelWithSilent, Logger } from 'pino';

export type ModelsOptions = {
  ably: Types.RealtimePromise;
  logLevel?: LevelWithSilent;
};

class Models {
  public ably: Types.RealtimePromise;
  private logger: Logger;
  private models: Record<string, Model<any>>;

  readonly version = '0.0.1';

  constructor(options: ModelsOptions) {
    this.models = {};
    this.ably = options.ably;
    this.logger = pino({ level: options.logLevel || 'silent' });
    this.ably.time();
  }

  Model = <T>(name: string, options: Omit<ModelOptions<T>, 'ably' | 'logger'>) => {
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('Model must have a non-empty name');
    }
    if (this.models[name]) {
      return this.models[name];
    }
    const model = new Model<T>(name, { ably: this.ably, logger: this.logger, ...options });
    this.models[name] = model;
    return model;
  };
}

export default Models;
