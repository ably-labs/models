import { Types } from 'ably';
import Stream from './Stream';
import EventEmitter from './utilities/EventEmitter';

export enum ModelState {
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

export type ModelOptions<T> = {
  streams: Array<Stream<any>>;
  sync: () => Promise<Versionable<T>>;
};

type ModelStateChange = {
  current: ModelState;
  previous: ModelState;
  reason?: Types.ErrorInfo | string;
};

export type Versionable<T> = {
  version: number;
  data: T;
};

class Model<T> extends EventEmitter<Record<ModelState, ModelStateChange>> {
  private currentState: ModelState = ModelState.INITIALIZED;
  private streams: Record<string, Stream<any>> = {};
  private sync: () => Promise<Versionable<T>>;
  private currentData: Versionable<T>;

  constructor(readonly name: string, options: ModelOptions<T>) {
    super();
    if (options) {
      for (let stream of options.streams) {
        this.streams[stream.name] = stream;
      }
      this.sync = options.sync;
    }
    this.init();
  }

  get state() {
    return this.currentState;
  }

  get data() {
    return this.currentData;
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
    this.currentData = await this.sync();
    this.setState(ModelState.READY);
  }
}

export default Model;
