import { Types } from 'ably';
import Stream from './Stream';
import EventEmitter from './utilities/EventEmitter';

enum ModelState {
  /**
   * The model has been initialized but no attach has yet been attempted.
   */
  INITIALIZED = 'initialized',
  /**
   * The model is attempting to synchronise its state via a synchronisation call.
   * The preparing state is entered as soon as the library has completed initialization,
   * and is reentered each time there is a discontinuity in one of the underlying streams,
   * or if there is an error updating the model.
   */
  PREPARING = 'preparing',
  /**
   * The model's underlying streams are in the READY state and the model is operating correctly.
   */
  READY = 'ready',
  /**
   * The user has paused the model and its' underlying streams.
   */
  PAUSED = 'paused',
  /**
   * The model has been disposed, either by the user disposing it or an unrecoverable error,
   * and its resources are available for garbage collection.
   */
  DISPOSED = 'disposed',
}

export type ModelOptions = {
  streams: Array<Stream<any>>;
  sync: SyncFunc<any>;
};

type ModelStateChange = {
  current: ModelState;
  previous: ModelState;
  reason?: Types.ErrorInfo | string;
};

export type Versionable = {
  version: number;
};

type SyncFunc<T extends Versionable> = () => Promise<T>;

class Model<T extends Versionable> extends EventEmitter<Record<ModelState, ModelStateChange>> {
  private currentState: ModelState = ModelState.INITIALIZED;
  private streams: Record<string, Stream<any>> = {};
  private sync: SyncFunc<T>;
  private data: T;

  constructor(readonly name: string, readonly client: Types.RealtimePromise, options?: ModelOptions) {
    super();
    if (options) {
      for (let stream of options.streams) {
        this.streams[stream.name] = stream;
      }
      this.sync = options.sync;
    }
  }

  get state() {
    return this.currentState;
  }

  setState(state: ModelState, reason?: Types.ErrorInfo | string) {
    const previous = this.currentState;
    this.currentState = state;
    this.emit(state, {
      current: this.currentState,
      previous,
      reason,
    } as ModelStateChange);
  }

  stream(name: string): Stream<any> {
    if (!this.streams[name]) {
      throw new Error(`stream with name '${name}' not registered on model '${this.name}'`);
    }
    return this.streams[name];
  }

  async init() {
    this.setState(ModelState.PREPARING);
    this.data = await this.sync();
    this.setState(ModelState.READY);
  }
}

export default Model;
