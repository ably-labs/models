import _ from 'lodash';
import type { Logger } from 'pino';
import type { Types as AblyTypes } from 'ably/promises.js';
import { Subject, Subscription } from 'rxjs';
import Stream, { IStream } from './Stream.js';
import StreamProvider from './StreamProvider.js';
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
  channel: string;
  name: string;
  data?: any;
};

type Confirmation = {
  confirmed: boolean;
};

export type SyncFunc<T> = () => Promise<Versioned<T>>;

export type UpdateFunc<T> = (state: T, event: Event) => Promise<T>;

export type MutationFunc<T extends any[] = any[], R = any> = (...args: T) => Promise<R>;

export type Mutation<T extends any[] = any[], R = any> = {
  mutate: MutationFunc<T, R>;
  // The timeout to receive a confirmation for optimistic mutation events in
  // milliseconds. If the timeout is reached without being confirmed the
  // optimistic events are rolled back.
  //
  // If unset there is no timeout (which is the default).
  confirmationTimeout?: number;
};

export type Streams = {
  [name: string]: Stream;
};

export type UpdateFuncs<T> = {
  [channel: string]: {
    [event: string]: UpdateFunc<T>[];
  };
};

export type UpdateOptions = {
  channel: string;
  event: string;
};

export type ModelOptions<T> = {
  ably: AblyTypes.RealtimePromise;
  logger: Logger;
  sync: SyncFunc<T>;
};

export type ModelStateChange = {
  current: ModelState;
  previous: ModelState;
  reason?: any;
};

export type Versioned<T> = {
  version: number;
  data: T;
};

function eventsAreEqual(e1: Event, e2: Event): boolean {
  return e1.channel === e2.channel && e1.name === e2.name && _.isEqual(e1.data, e2.data);
}

export type SubscriptionOptions = {
  optimistic: boolean;
};

type PendingConfirmation = {
  unconfirmedEvents: Event[];
  timeout: ReturnType<typeof setTimeout>;
  resolve: () => void;
  reject: (err?: Error) => void;
};

type Registration<T> = {
  $update?: {
    [channel: string]: {
      [event: string]: UpdateFunc<T>;
    };
  };
  $mutate?: {
    [name: string]: Mutation;
  };
};

class Model<T> extends EventEmitter<Record<ModelState, ModelStateChange>> {
  private currentState: ModelState = ModelState.INITIALIZED;
  private optimisticData: T;
  private confirmedData: T;

  private sync: SyncFunc<T>;
  private streamProvider: StreamProvider;
  private updateFuncs: UpdateFuncs<T> = {};
  private mutations: Record<string, Mutation> = {};

  private optimisticEvents: Event[] = [];
  private pendingConfirmations: PendingConfirmation[] = [];

  private subscriptions = new Subject<{ confirmed: boolean; data: T }>();
  private subscriptionMap: Map<StandardCallback<T>, Subscription> = new Map();
  private streamSubscriptionsMap: Map<IStream, StandardCallback<AblyTypes.Message>> = new Map();

  private logger: Logger;
  private baseLogContext: Partial<{ scope: string; action: string }>;

  constructor(readonly name: string, options: ModelOptions<T>) {
    super();
    this.logger = options.logger;
    this.streamProvider = new StreamProvider({ ably: options.ably, logger: options.logger });
    this.sync = options.sync;
    this.baseLogContext = { scope: `Model:${name}` };
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

  public async $pause() {
    this.logger.trace({ ...this.baseLogContext, action: 'pause()' });
    this.setState(ModelState.PAUSED);
    for (const streamName in this.streamProvider.streams) {
      await this.streamProvider.streams[streamName].pause();
    }
  }

  public async $resume() {
    this.logger.trace({ ...this.baseLogContext, action: 'resume()' });
    for (const streamName in this.streamProvider.streams) {
      await this.streamProvider.streams[streamName].resume();
    }
    this.setState(ModelState.READY);
  }

  public async $register(registration: Registration<T>) {
    for (let channel in registration.$update) {
      for (let event in registration.$update[channel]) {
        this._registerUpdate(registration.$update[channel][event], { channel, event });
      }
    }
    for (let name in registration.$mutate) {
      this._registerMutation(name, registration.$mutate[name]);
    }
  }

  private async _registerUpdate(update: UpdateFunc<T>, { channel, event }: UpdateOptions) {
    this.logger.trace({ ...this.baseLogContext, action: 'registerUpdate()', channel, event });
    if (!this.streamProvider.streams[channel]) {
      this.addStream(channel);
    }
    if (!this.updateFuncs[channel]) {
      this.updateFuncs[channel] = {};
    }
    if (!this.updateFuncs[channel][event]) {
      this.updateFuncs[channel][event] = [];
    }
    this.updateFuncs[channel][event].push(update);
  }

  private _registerMutation(name: string, mutation: Mutation) {
    this.logger.trace({
      ...this.baseLogContext,
      action: 'registerMutation()',
      name,
      confirmationTimeout: mutation.confirmationTimeout,
    });
    if (this.mutations[name]) {
      throw new Error(`mutation with name '${name}' already registered on model '${this.name}'`);
    }
    this.mutations[name] = mutation;
  }

  public async mutate<TArgs extends any[], R>(
    name: string,
    options?: { events?: Event[]; args?: TArgs },
  ): Promise<[R, Promise<void>]> {
    this.logger.trace({ ...this.baseLogContext, action: 'mutate()', name, opts: options });
    const mutation: Mutation<TArgs, R> = this.mutations[name];
    if (!mutation) {
      throw new Error(`mutation with name '${name}' not registered on model '${this.name}'`);
    }

    try {
      let confirmationPromise = Promise.resolve();
      if (options?.events) {
        for (const event of options.events) {
          await this.onStreamEvent({ ...event, confirmed: false });
        }

        if (mutation.confirmationTimeout) {
          confirmationPromise = this.addPendingConfirmation(options.events, mutation.confirmationTimeout);
        }
      }

      const args = options?.args || [];
      const result = await mutation.mutate(...(args as TArgs));
      return [result, confirmationPromise];
    } catch (e) {
      // If an error occurs either applying the optimistic events, or requesting
      // the mutation, revert the events.
      if (options?.events) {
        await this.revertOptimisticEvents(options?.events);
      }
      throw e;
    }
  }

  public subscribe(callback: StandardCallback<T>, options: SubscriptionOptions = { optimistic: true }) {
    this.logger.trace({ ...this.baseLogContext, action: 'subscribe()', options });
    const subscription = this.subscriptions.subscribe({
      next: (value) => {
        this.logger.trace({ ...this.baseLogContext, action: 'next()', value });
        if (options.optimistic && !value.confirmed) {
          callback(null, value.data);
          return;
        }
        if (!options.optimistic && value.confirmed) {
          callback(null, value.data);
          return;
        }
      },
      error: (err) => {
        this.logger.trace({ ...this.baseLogContext, action: 'error()', err });
        callback(err);
      },
      complete: () => {
        this.logger.trace({ ...this.baseLogContext, action: 'complete()' });
        this.unsubscribe(callback);
      },
    });
    this.subscriptionMap.set(callback, subscription);
  }

  public unsubscribe(callback: StandardCallback<T>) {
    this.logger.trace({ ...this.baseLogContext, action: 'unsubscribe()' });
    const subscription = this.subscriptionMap.get(callback);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptionMap.delete(callback);
    }
  }

  public dispose(reason?: Error) {
    this.logger.trace({ ...this.baseLogContext, action: 'dispose()', reason });
    this.setState(ModelState.DISPOSED, reason);
    this.subscriptions.unsubscribe();
    for (const streamName in this.streamProvider.streams) {
      const stream = this.streamProvider.streams[streamName];
      const callback = this.streamSubscriptionsMap.get(stream);
      if (callback) {
        stream.unsubscribe(callback);
      }
    }
    for (const pendingConfirmation of this.pendingConfirmations) {
      if (pendingConfirmation.timeout) {
        clearTimeout(pendingConfirmation.timeout);
      }
      if (pendingConfirmation.reject) {
        pendingConfirmation.reject(reason);
      }
    }
    this.subscriptionMap.clear();
    this.streamSubscriptionsMap.clear();
  }

  private setState(state: ModelState, reason?: Error) {
    this.logger.trace({ ...this.baseLogContext, action: 'setState()', state, reason });
    const previous = this.currentState;
    this.currentState = state;
    this.emit(state, {
      current: this.currentState,
      previous,
      reason,
    } as ModelStateChange);
  }

  private setOptimisticData(data: T) {
    this.logger.trace({ ...this.baseLogContext, action: 'setOptimisticData()', data });
    this.optimisticData = data;
    this.subscriptions.next({ confirmed: false, data });
  }

  private setConfirmedData(data: T) {
    this.logger.trace({ ...this.baseLogContext, action: 'setConfirmedData()', data });
    this.confirmedData = data;
    this.subscriptions.next({ confirmed: true, data });
  }

  private async applyUpdates(initialData: T, event: Event): Promise<T> {
    this.logger.trace({ ...this.baseLogContext, action: 'applyUpdates()', initialData, event });
    let data = initialData;
    for (let eventName in this.updateFuncs[event.channel]) {
      if (event.name === eventName) {
        for (let updator of this.updateFuncs[event.channel][eventName]) {
          data = await updator(data, event);
        }
      }
    }
    return data;
  }

  private async onStreamEvent(event?: Event & Confirmation) {
    this.logger.trace({ ...this.baseLogContext, action: 'onStreamEvent()', event });
    if (!event) {
      return;
    }
    if (!this.streamProvider.streams[event.channel]) {
      throw new Error(`stream with name '${event.channel}' not registered on model '${this.name}'`);
    }
    if (!this.updateFuncs[event.channel]) {
      return;
    }

    // eagerly apply optimistic updates
    if (!event.confirmed) {
      this.optimisticEvents.push(event);
      this.setOptimisticData(await this.applyUpdates(this.optimisticData, event));
      return;
    }

    this.confirmPendingEvents(event);

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

  private removeStreams() {
    for (const channel in this.streamProvider.streams) {
      const stream = this.streamProvider.streams[channel];
      const callback = this.streamSubscriptionsMap.get(stream);
      if (callback) {
        stream.unsubscribe(callback);
      }
    }
    this.streamSubscriptionsMap.clear();
  }

  private addStream(channel: string) {
    this.streamProvider.streams[channel] = this.streamProvider.getOrCreate({ channel });
    const callback: StandardCallback<AblyTypes.Message> = async (err, event) => {
      try {
        if (err) {
          throw err;
        }
        await this.onStreamEvent({ ...event!, channel, confirmed: true });
      } catch (e) {
        this.init(e);
      }
    };
    this.streamProvider.streams[channel].subscribe(callback);
    this.streamSubscriptionsMap.set(this.streamProvider.streams[channel], callback);
  }

  private async init(reason?: Error) {
    this.logger.trace({ ...this.baseLogContext, action: 'init()', reason });
    this.setState(ModelState.PREPARING, reason);

    this.removeStreams();

    for (let channel in this.streamProvider.streams) {
      this.addStream(channel);
    }

    const { data } = await this.sync();
    this.setOptimisticData(data);
    this.setConfirmedData(data);
    this.setState(ModelState.READY);
  }

  private addPendingConfirmation(events: Event[], timeout: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.logger.trace({ ...this.baseLogContext, action: 'addPendingConfirmation()', events, timeout });
      let pendingConfirmation = {
        unconfirmedEvents: [...events],
        resolve: resolve,
        reject: reject,
      } as PendingConfirmation;
      this.pendingConfirmations.push(pendingConfirmation);

      pendingConfirmation.timeout = setTimeout(() => {
        this.revertOptimisticEvents(pendingConfirmation.unconfirmedEvents);
        // Remove the pending confirmation.
        this.pendingConfirmations = this.pendingConfirmations.filter((p) => p !== pendingConfirmation);
        reject(new Error('timed out waiting for event confirmation'));
      }, timeout);
    });
  }

  private confirmPendingEvents(event: Event) {
    this.logger.trace({ ...this.baseLogContext, action: 'confirmPendingEvents()', event });
    for (let pendingConfirmation of this.pendingConfirmations) {
      // Remove any unconfirmed events that have now been confirmed.
      pendingConfirmation.unconfirmedEvents = pendingConfirmation.unconfirmedEvents.filter(
        (e) => !eventsAreEqual(e, event),
      );

      // If the pending confirmation no longer has any pending optimistic events
      // it can be resolved.
      if (pendingConfirmation.unconfirmedEvents.length === 0) {
        clearTimeout(pendingConfirmation.timeout);
        pendingConfirmation.resolve();
      }
    }

    // If the pending confirmation no longer has any pending optimistic
    // events it can be removed.
    this.pendingConfirmations = this.pendingConfirmations.filter((p) => p.unconfirmedEvents.length !== 0);
  }

  private async revertOptimisticEvents(events: Event[]) {
    this.logger.trace({ ...this.baseLogContext, action: 'revertOptimisticEvents()', events });
    // Remove any events from optimisticEvents and re-apply any unconfirmed
    // optimistic events.
    for (let event of events) {
      this.optimisticEvents = this.optimisticEvents.filter((e) => !eventsAreEqual(e, event));
    }
    let nextData = this.confirmedData;
    for (const e of this.optimisticEvents) {
      nextData = await this.applyUpdates(nextData, e);
    }
    this.setOptimisticData(nextData);
  }
}

export default Model;
