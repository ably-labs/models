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

type SyncFunc<T> = () => Promise<Versioned<T>>;
type UpdateFunc<T> = (state: T, event: Types.Message) => Promise<T>;

type Streams = {
  [name: string]: Stream;
};

type UpdateFuncs<T> = {
  [streamName: string]: {
    [eventName: string]: UpdateFunc<T>[];
  };
};

export type ModelOptions<T> = {
  streams: Streams;
  sync: SyncFunc<T>;
};

export type ModelStateChange = {
  current: ModelState;
  previous: ModelState;
  reason?: Types.ErrorInfo | string;
};

export type Versioned<T> = {
  version: number;
  data: T;
};

class Model<T> extends EventEmitter<Record<ModelState, ModelStateChange>> {
  private currentState: ModelState = ModelState.INITIALIZED;
  private currentData: Versioned<T>;

  private sync: SyncFunc<T>;
  private streams: Streams;
  private updateFuncs: UpdateFuncs<Versioned<T>> = {};

  private subscriptions = new Subject<T>();
  private subscriptionMap: Map<StandardCallback<T>, Subscription> = new Map();

  private streamSubscriptionsMap: Map<Stream, StandardCallback<Types.Message>> = new Map();

  constructor(readonly name: string, options: ModelOptions<T>) {
    super();
    if (options) {
      this.streams = options.streams;
      this.sync = options.sync;
    }
  }

  public get state() {
    return this.currentState;
  }

  public get data() {
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

  public registerUpdate(stream: string, event: string, update: UpdateFunc<Versioned<T>>) {
    if (this.currentState !== ModelState.INITIALIZED) {
      throw new Error(`model is not in initialized state (state = ${this.currentState})`);
    }
    if (!this.streams[stream]) {
      throw new Error(`stream with name '${stream}' not registered on model '${this.name}'`);
    }
    if (!this.updateFuncs[stream]) {
      this.updateFuncs[stream] = {};
    }
    if (!this.updateFuncs[stream][event]) {
      this.updateFuncs[stream][event] = [];
    }
    this.updateFuncs[stream][event].push(update);
  }

  public subscribe(callback: StandardCallback<T>) {
    const subscription = this.subscriptions.subscribe({
      next: (message) => callback(null, message),
      error: (err) => callback(err),
      complete: () => this.unsubscribe(callback),
    });
    this.subscriptionMap.set(callback, subscription);
  }

  public unsubscribe(callback: StandardCallback<T>) {
    const subscription = this.subscriptionMap.get(callback);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptionMap.delete(callback);
    }
  }

  public dispose(reason?: Types.ErrorInfo | string) {
    this.setState(ModelState.DISPOSED, reason);
    this.subscriptions.unsubscribe();
    for (const streamName in this.streams) {
      const stream = this.streams[streamName];
      const callback = this.streamSubscriptionsMap.get(stream);
      if (callback) {
        stream.unsubscribe(callback);
      }
    }
    this.subscriptionMap.clear();
    this.streamSubscriptionsMap.clear();
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

  private async onMessage(stream: string, err: Error | null | undefined, event: Types.Message | undefined) {
    if (err) {
      this.onError(err);
      return;
    }
    if (!this.streams[stream]) {
      this.onError(new Error(`stream with name '${stream}' not registered on model '${this.name}'`));
      return;
    }
    if (!this.updateFuncs[stream]) {
      return;
    }
    for (let eventName in this.updateFuncs[stream]) {
      if (event?.name === eventName) {
        for (let updator of this.updateFuncs[stream][eventName]) {
          this.setData(await updator(this.currentData, event));
        }
      }
    }
  }

  private async onError(err) {
    throw new Error(`onError not implemented: err = ${err}`);
  }

  private async init() {
    this.setState(ModelState.PREPARING);
    for (let streamName in this.updateFuncs) {
      const stream = this.streams[streamName];
      const callback = (err: Error | null | undefined, event: Types.Message | undefined) =>
        this.onMessage(streamName, err, event);
      stream.subscribe(callback);
      this.streamSubscriptionsMap.set(stream, callback);
    }
    this.currentData = await this.sync();
    this.setState(ModelState.READY);
  }
}

export default Model;
