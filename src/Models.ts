import { Types, Realtime } from 'ably';
import ModelOptions from './options/ModelOptions';
import Model from './Model';
import EventStreamOptions from './options/EventStreamOptions';
import EventStream from './EventStream';

class Models {
  private models: Record<string, Model<any>>;
  private eventStreams: Record<string, EventStream<any>>;
  ably: Types.RealtimePromise;

  readonly version = '0.0.1';

  constructor(optionsOrAbly: Types.RealtimePromise | Types.ClientOptions | string) {
    this.models = {};
    this.eventStreams = {};
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

  Model = <T>(name: string, options?: ModelOptions) => {
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('Model must have a non-empty name');
    }

    if (this.models[name]) return this.models[name];

    const model = new Model<T>(name, this.ably, options);
    this.models[name] = model;

    return model;
  };

  EventStream = <T>(name: string, options?: EventStreamOptions) => {
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('EventStream must have a non-empty name');
    }

    if (this.eventStreams[name]) return this.eventStreams[name];

    if (!options) {
      throw new Error('EventStream cannot be instantiated without options');
    }

    const eventStream = new EventStream<T>(name, this.ably, options);
    this.eventStreams[name] = eventStream;

    return eventStream;
  };
}

export default Models;
