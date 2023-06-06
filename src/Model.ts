import { Types } from 'ably';
import Stream from './Stream';
import EventEmitter from './utilities/EventEmitter';
import { StandardCallback } from './types/callbacks';
import { Subject, Subscription } from 'rxjs';

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

type Streams = Record<string, Stream>;

export type ModelOptions<T> = {
  streams: Streams;
  sync: SyncFunc<T>;
};

type ModelStateChange = {
  current: ModelState;
  previous: ModelState;
  reason?: Types.ErrorInfo | string;
};

export type Versioned<T> = {
  version: number;
  data: T;
};

type SyncFunc<T> = () => Promise<Versioned<T>>;
type UpdateFunc<T> = (state: T, event: Types.Message) => Promise<T>;

class Model<T> extends EventEmitter<Record<ModelState, ModelStateChange>> {
  private currentState: ModelState = ModelState.INITIALIZED;
  private streams: Streams;
  private sync: SyncFunc<T>;
  private currentData: Versioned<T>;
  private updators: Record<string, Record<string, Array<UpdateFunc<Versioned<T>>>>> = {}; // stream name -> event name -> update funcs
  private subscriptions = new Subject<T>();
  private subscriptionMap: Map<StandardCallback<T>, Subscription> = new Map();

  constructor(readonly name: string, options: ModelOptions<T>) {
    super();
    if (options) {
      this.streams = options.streams;
      this.sync = options.sync;
    }
  }

  get state() {
    return this.currentState;
  }

  get data() {
    return this.currentData;
  }

  public stream(name: string): Stream {
    if (!this.streams[name]) {
      throw new Error(`stream with name '${name}' not registered on model '${this.name}'`);
    }
    return this.streams[name];
  }

  public start() {
    this.init();
  }

  registerUpdate(stream: string, event: string, update: UpdateFunc<Versioned<T>>) {
    if (this.currentState !== ModelState.INITIALIZED) {
      throw new Error(`model is not in initialized state (state = ${this.currentState})`);
    }
    if (!this.streams[stream]) {
      throw new Error(`stream with name '${stream}' not registered on model '${this.name}'`);
    }
    if (!this.updators[stream]) {
      this.updators[stream] = {};
    }
    if (!this.updators[stream][event]) {
      this.updators[stream][event] = [];
    }
    this.updators[stream][event].push(update);
  }

  private setState(state: ModelState, reason?: Types.ErrorInfo | string) {
    const previous = this.currentState;
    this.currentState = state;
    this.emit(state, {
      current: this.currentState,
      previous,
      reason,
    } as ModelStateChange);
  }

  private setData(data: Versioned<T>) {
    this.currentData = data;
    this.subscriptions.next(data.data);
  }

  subscribe(callback: StandardCallback<T>) {
    const subscription = this.subscriptions.subscribe({
      next: (message) => callback(null, message),
      error: (err) => callback(err),
      complete: () => this.unsubscribe(callback),
    });
    this.subscriptionMap.set(callback, subscription);
  }

  unsubscribe(callback: StandardCallback<T>) {
    const subscription = this.subscriptionMap.get(callback);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptionMap.delete(callback);
    }
  }

  private async onMessage(stream: string, err: Error | null | undefined, event: Types.Message | undefined) {
    if (err) {
      // TODO handle error
    }
    if (!this.streams[stream]) {
      throw new Error(`stream with name '${stream}' not registered on model '${this.name}'`);
    }
    if (this.updators[stream]) {
      for (let eventName in this.updators[stream]) {
        if (event?.name === eventName) {
          for (let updator of this.updators[stream][eventName]) {
            this.setData(await updator(this.currentData, event));
          }
        }
      }
    }
  }

  private async init() {
    this.setState(ModelState.PREPARING);
    for (let streamName in this.updators) {
      const stream = this.streams[streamName];
      stream.subscribe((err, event) => this.onMessage(streamName, err, event));
      // TODO unregister
    }
    this.currentData = await this.sync();
    this.setState(ModelState.READY);
  }
}

export default Model;
