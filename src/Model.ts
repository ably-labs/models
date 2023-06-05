import { Types } from 'ably';
import Stream from './Stream';
import ModelOptions from './options/ModelOptions';
import EventEmitter from './utilities/EventEmitter';

enum ModelState {
  /**
   * The model has been initialized but has not yet been synchronised.
   */
  INITIALIZED = 'initialized',
  /**
   * An indefinite failure condition. This state is entered if a channel error has been received from the Ably service, such as an attempt to attach without the necessary access rights.
   */
  FAILED = 'failed',
}

class Model<T> extends EventEmitter<any> {
  private state: ModelState = ModelState.INITIALIZED;
  private streams: Record<string, Stream<any>> = {};
  private data: T;

  constructor(readonly name: string, readonly client: Types.RealtimePromise, options?: ModelOptions) {
    super();
    if (options) {
      for (let stream of options.streams) {
        this.streams[stream.name] = stream;
      }
    }
  }

  stream(name: string): Stream<any> {
    if (!this.streams[name]) {
      throw new Error(`stream with name '${name}' not registered on model '${this.name}'`);
    }
    return this.streams[name];
  }
}

export default Model;
