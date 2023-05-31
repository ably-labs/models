import { Types, Realtime } from 'ably';
import ModelOptions from './options/ModelOptions';
import Model from './Model';

class Models {
  private models: Record<string, Model>;
  private channel: Types.RealtimeChannelPromise;
  ably: Types.RealtimePromise;

  readonly version = '0.0.1';

  constructor(optionsOrAbly: Types.RealtimePromise | Types.ClientOptions | string) {
    this.models = {};
    if (optionsOrAbly['options']) {
      this.ably = optionsOrAbly as Types.RealtimePromise;
      this.addAgent(this.ably['options'], false);
    } else {
      let options: Types.ClientOptions = typeof optionsOrAbly === 'string' ? { key: optionsOrAbly } : optionsOrAbly;
      this.addAgent(options, true);
      this.ably = new Realtime.Promise(options);
    }
    this.ably.time();
  }

  private addAgent(options: any, isDefault: boolean) {
    const agent = `ably-models/${this.version}`;
    const clientType = isDefault ? 'model-default-client' : 'model-custom-client';
    if (!options.agents) {
      options.agents = [agent, clientType];
    } else if (!options.agents.includes(agent)) {
      options.agents.push(agent, clientType);
    }
  }

  async get(name: string, options?: ModelOptions): Promise<Model> {
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('Models must have a non-empty name');
    }

    if (this.models[name]) return this.models[name];

    if (this.ably.connection.state !== 'connected') {
      await this.ably.connection.once('connected');
    }

    const model = new Model(name, this.ably, options);
    this.models[name] = model;

    return model;
  }
}

export default Models;
