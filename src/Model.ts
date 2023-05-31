import { Types } from 'ably';

import ModelOptions from './options/ModelOptions';
import EventEmitter from './utilities/EventEmitter';

const MODEL_OPTIONS_DEFAULTS = {};

class Model extends EventEmitter<any> {
  private options: ModelOptions;
  private connectionId?: string;

  constructor(readonly name: string, readonly client: Types.RealtimePromise, options?: ModelOptions) {
    super();
    this.options = { ...MODEL_OPTIONS_DEFAULTS, ...options };
    this.connectionId = this.client.connection.id;
  }
}

export default Model;
