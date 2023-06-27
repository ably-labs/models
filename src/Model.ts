import _ from 'lodash';
import { Subject, Subscription } from 'rxjs';
import { Types } from 'ably';
import Stream from './Stream.js';
import EventEmitter from './utilities/EventEmitter.js';
import type { StandardCallback } from './types/callbacks';

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

export type Event = {
  stream: string;
  name: string;
  data?: any;
};

type Confirmation = {
  confirmed: boolean;
};

export type SyncFunc<T> = () => Promise<Versioned<T>>;

export type UpdateFunc<T> = (state: T, event: Event) => Promise<T>;

export type MutationResult<R> = {
  result: R;
  events: Event[];
};

export type MutationFunc<T extends any[] = any[], R = any> = (...args: T) => Promise<MutationResult<R>>;

export type Mutation<T extends any[] = any[], R = any> = {
  mutate: MutationFunc<T, R>;
};

export type Streams = {
  [name: string]: Stream;
};

export type UpdateFuncs<T> = {
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

function eventsAreEqual(e1: Event, e2: Event): boolean {
  return e1.stream === e2.stream && e1.name === e2.name && _.isEqual(e1.data, e2.data);
}

type SubscriptionOptions = {
  optimistic: boolean;
};

class Model<T> extends EventEmitter<Record<ModelState, ModelStateChange>> {
  private currentState: ModelState = ModelState.INITIALIZED;
  private optimisticData: T;
  private confirmedData: T;

  private sync: SyncFunc<T>;
  private streams: Streams;
  private updateFuncs: UpdateFuncs<T> = {};
  private mutations: Record<string, Mutation> = {};

  private optimisticEvents: Event[] = [];

  private subscriptions = new Subject<{ confirmed: boolean; data: T }>();
  private subscriptionMap: Map<StandardCallback<T>, Subscription> = new Map();
  private streamSubscriptionsMap: Map<Stream, StandardCallback<Types.Message>> = new Map();

  constructor(readonly name: string, options: ModelOptions<T>) {
    super();
    if (options) {
      this.streams = options.streams;
      this.sync = options.sync;
    }
    this.init();
  }

  public get state() {
    return this.currentState;
  }

  public get optimistic() {
    return this.optimisticData;
  }

  public get confirmed() {
    return this.confirmedData;
  }

  public async pause() {
    this.setState(ModelState.PAUSED);
    for (const streamName in this.streams) {
      await this.streams[streamName].pause();
    }
  }

  public async resume() {
    for (const streamName in this.streams) {
      await this.streams[streamName].resume();
    }
    this.setState(ModelState.READY);
  }

  public stream(name: string): Stream {
    if (!this.streams[name]) {
      throw new Error(`stream with name '${name}' not registered on model '${this.name}'`);
    }
    return this.streams[name];
  }

  public registerUpdate(stream: string, event: string, update: UpdateFunc<T>) {
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

  public registerMutation(name: string, mutation: Mutation) {
    if (this.mutations[name]) {
      throw new Error(`mutation with name '${name}' already registered on model '${this.name}'`);
    }
    this.mutations[name] = mutation;
  }

  public async mutate<TArgs extends any[], R>(name: string, ...args: TArgs): Promise<R> {
    const mutation: Mutation<TArgs, R> = this.mutations[name];
    if (!mutation) {
      throw new Error(`mutation with name '${name}' not registered on model '${this.name}'`);
    }
    const { result, events } = await mutation.mutate(...args);

    for (const event of events) {
      await this.onStreamEvent(null, { ...event, confirmed: false });
    }

    return result;
  }

  public subscribe(callback: StandardCallback<T>, options: SubscriptionOptions = { optimistic: true }) {
    const subscription = this.subscriptions.subscribe({
      next: (value) => {
        if (options.optimistic && !value.confirmed) {
          callback(null, value.data);
          return;
        }
        if (!options.optimistic && value.confirmed) {
          callback(null, value.data);
          return;
        }
      },
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

  private setOptimisticData(data: T) {
    this.optimisticData = data;
    this.subscriptions.next({ confirmed: false, data });
  }

  private setConfirmedData(data: T) {
    this.confirmedData = data;
    this.subscriptions.next({ confirmed: true, data });
  }

  private async applyUpdates(initialData: T, event: Event): Promise<T> {
    let data = initialData;
    for (let eventName in this.updateFuncs[event.stream]) {
      if (event.name === eventName) {
        for (let updator of this.updateFuncs[event.stream][eventName]) {
          data = await updator(data, event);
        }
      }
    }
    return data;
  }

  private async onStreamEvent(err: Error | null | undefined, event?: Event & Confirmation) {
    if (err) {
      await this.onError(err);
      return;
    }
    if (!event) {
      await this.onError('received empty event');
      return;
    }
    if (!this.streams[event.stream]) {
      await this.onError(new Error(`stream with name '${event.stream}' not registered on model '${this.name}'`));
      return;
    }
    if (!this.updateFuncs[event.stream]) {
      return;
    }

    // eagerly apply optimistic updates
    if (!event.confirmed) {
      this.optimisticEvents.push(event);
      this.setOptimisticData(await this.applyUpdates(this.optimisticData, event));
      return;
    }

    // if the incoming confirmed event confirms the next expected optimistic event for the stream, it is
    // discarded without applying it to the speculative state because its effect has already been optimistically applied
    let unexpectedEvent = true;
    for (let i = 0; i < this.optimisticEvents.length; i++) {
      let e = this.optimisticEvents[i];
      if (eventsAreEqual(e, event)) {
        this.optimisticEvents.splice(i, 1);
        this.setConfirmedData(await this.applyUpdates(this.confirmedData, event));
        unexpectedEvent = false;
        break;
      }
    }

    // if the incoming confirmed event doesn't match any optimistic event,
    // we need to roll back to the last-confirmed state, apply the incoming event,
    // and rebase the optimistic updates on top
    if (unexpectedEvent) {
      let nextData = await this.applyUpdates(this.confirmedData, event);
      this.setConfirmedData(nextData);
      for (const e of this.optimisticEvents) {
        nextData = await this.applyUpdates(nextData, e);
      }
      this.setOptimisticData(nextData);
    }
  }

  private async onError(err) {
    throw new Error(`onError not implemented: err = ${err}`);
  }

  private async init() {
    this.setState(ModelState.PREPARING);
    for (let streamName in this.streams) {
      const stream = this.streams[streamName];
      const callback: StandardCallback<Types.Message> = (err, event) => {
        if (err) {
          this.onStreamEvent(err);
          return;
        }
        this.onStreamEvent(null, { ...event!, stream: streamName, confirmed: true });
      };
      stream.subscribe(callback);
      this.streamSubscriptionsMap.set(stream, callback);
    }
    const { data } = await this.sync();
    this.setOptimisticData(data);
    this.setConfirmedData(data);
    this.setState(ModelState.READY);
  }
}

export default Model;
