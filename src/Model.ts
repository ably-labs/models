import type { Logger } from 'pino';
import type { Types as AblyTypes } from 'ably/promises.js';
import { Subject, Subscription } from 'rxjs';
import Stream, { IStream } from './Stream.js';
import StreamRegistry from './StreamRegistry.js';
import EventEmitter from './utilities/EventEmitter.js';
import type { StandardCallback } from './types/callbacks';
import UpdatesRegistry, { UpdateFunc } from './UpdatesRegistry.js';
import MutationsRegistry, { MutationRegistration, MutationMethods, EventComparator } from './MutationsRegistry.js';
import { UpdateRegistrationError } from './Errors.js';

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

export type EventParams = {
  timeout: number;
  comparator: EventComparator;
};

export type OptimisticEvent = Event & {
  confirmed: false;
};

export type ConfirmedEvent = Event & {
  confirmed: true;
};

export type OptimisticEventWithParams = OptimisticEvent & {
  params: EventParams;
};

export type SyncFunc<T> = () => Promise<Versioned<T>>;

export type Streams = {
  [name: string]: Stream;
};

export type ModelOptions = {
  ably: AblyTypes.RealtimePromise;
  logger: Logger;
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

export type SubscriptionOptions = {
  optimistic: boolean;
};

type PendingConfirmation = {
  unconfirmedEvents: OptimisticEventWithParams[];
  timeout: ReturnType<typeof setTimeout>;
  resolve: () => void;
  reject: (err?: Error) => void;
};

type Registration<T, M extends MutationMethods> = {
  $sync: SyncFunc<T>;
  $update?: {
    [channel: string]: {
      [event: string]: UpdateFunc<T>;
    };
  };
  $mutate?: { [K in keyof M]: MutationRegistration<M[K]> };
};

class Model<T, M extends MutationMethods> extends EventEmitter<Record<ModelState, ModelStateChange>> {
  private wasRegistered = false;
  private currentState: ModelState = ModelState.INITIALIZED;
  private optimisticData: T;
  private confirmedData: T;

  private sync: SyncFunc<T>;
  private streamRegistry: StreamRegistry;
  private updatesRegistry: UpdatesRegistry<T> = new UpdatesRegistry<T>();
  private mutationsRegistry: MutationsRegistry<M>;

  private optimisticEvents: OptimisticEventWithParams[] = [];
  private pendingConfirmations: PendingConfirmation[] = [];

  private subscriptions = new Subject<{ confirmed: boolean; data: T }>();
  private subscriptionMap: Map<StandardCallback<T>, Subscription> = new Map();
  private streamSubscriptionsMap: Map<IStream, StandardCallback<AblyTypes.Message>> = new Map();

  private logger: Logger;
  private baseLogContext: Partial<{ scope: string; action: string }>;

  constructor(readonly name: string, options: ModelOptions) {
    super();
    this.logger = options.logger;
    this.streamRegistry = new StreamRegistry({ ably: options.ably, logger: options.logger });
    this.baseLogContext = { scope: `Model:${name}` };
    this.mutationsRegistry = new MutationsRegistry<M>({
      onEvents: this.onMutationEvents.bind(this),
      onError: this.onMutationError.bind(this),
    });
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

  public get mutations() {
    return this.mutationsRegistry.handler;
  }

  public async $pause() {
    this.logger.trace({ ...this.baseLogContext, action: 'pause()' });
    this.setState(ModelState.PAUSED);
    for (const streamName in this.streamRegistry.streams) {
      await this.streamRegistry.streams[streamName].pause();
    }
  }

  public async $resume() {
    this.logger.trace({ ...this.baseLogContext, action: 'resume()' });
    for (const streamName in this.streamRegistry.streams) {
      await this.streamRegistry.streams[streamName].resume();
    }
    this.setState(ModelState.READY);
  }

  public $dispose(reason?: Error) {
    this.logger.trace({ ...this.baseLogContext, action: 'dispose()', reason });
    this.setState(ModelState.DISPOSED, reason);
    this.subscriptions.unsubscribe();
    for (const streamName in this.streamRegistry.streams) {
      const stream = this.streamRegistry.streams[streamName];
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
    return new Promise((resolve) => this.whenState(ModelState.DISPOSED, this.state, resolve));
  }

  public $register(registration: Registration<T, M>) {
    if (this.wasRegistered) {
      throw new Error('$register was already called');
    }
    if (this.state !== ModelState.INITIALIZED) {
      throw new Error(
        `$register can only be called when the model is in the ${ModelState.INITIALIZED} state (current: ${this.state})`,
      );
    }
    this.wasRegistered = true;
    this.sync = registration.$sync;
    for (let channel in registration.$update) {
      for (let event in registration.$update[channel]) {
        if (!this.streamRegistry.streams[channel]) {
          this.addStream(channel);
        }
        this.updatesRegistry.register(registration.$update[channel][event], { channel, event });
      }
    }
    if (registration.$mutate) {
      this.mutationsRegistry.register(registration.$mutate);
    }
    this.init();
    return new Promise((resolve) => this.whenState(ModelState.READY, this.state, resolve));
  }

  private async onMutationEvents(events: OptimisticEventWithParams[]) {
    if (events.length === 0) {
      return;
    }
    if (!events.every((event) => event.params.timeout === events[0].params.timeout)) {
      throw new Error('expected every optimistic event in batch to have the same timeout');
    }
    for (const event of events) {
      if (!this.streamRegistry.streams[event.channel]) {
        throw new Error(`stream with name '${event.channel}' not registered on model '${this.name}'`);
      }
    }
    const optimistic = this.onStreamEvents(events);
    let confirmation = this.addPendingConfirmation(events, events[0].params.timeout);
    return [
      optimistic,
      // if optimistically applying an update fails, the confirmation promise should also reject
      Promise.all([optimistic, confirmation]),
    ];
  }

  private async onMutationError(err: Error, events: OptimisticEventWithParams[]) {
    this.logger.error({ ...this.baseLogContext, action: 'onMutationError()', err, events });
    if (events) {
      await this.revertOptimisticEvents(events);
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

  protected setState(state: ModelState, reason?: Error) {
    this.logger.trace({ ...this.baseLogContext, action: 'setState()', state, reason });
    const previous = this.currentState;
    this.currentState = state;
    this.emit(state, {
      current: this.currentState,
      previous,
      reason,
    } as ModelStateChange);
  }

  private async init(reason?: Error) {
    this.logger.trace({ ...this.baseLogContext, action: 'init()', reason });
    this.setState(ModelState.PREPARING, reason);

    this.removeStreams();

    for (let channel in this.streamRegistry.streams) {
      this.addStream(channel);
    }

    const { data } = await this.sync();
    this.setOptimisticData(data);
    this.setConfirmedData(data);
    this.setState(ModelState.READY);
  }

  private removeStreams() {
    for (const channel in this.streamRegistry.streams) {
      const stream = this.streamRegistry.streams[channel];
      const callback = this.streamSubscriptionsMap.get(stream);
      if (callback) {
        stream.unsubscribe(callback);
      }
    }
    this.streamSubscriptionsMap.clear();
  }

  private addStream(channel: string) {
    this.streamRegistry.streams[channel] = this.streamRegistry.getOrCreate({ channel });
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
    this.streamRegistry.streams[channel].subscribe(callback);
    this.streamSubscriptionsMap.set(this.streamRegistry.streams[channel], callback);
  }

  private setOptimisticData(data: T) {
    this.logger.trace({ ...this.baseLogContext, action: 'setOptimisticData()', data });
    this.optimisticData = data;
    setImmediate(() => {
      // allow other updates to finish before invoking subscription callback
      if (this.state !== ModelState.DISPOSED) {
        this.subscriptions.next({ confirmed: false, data });
      }
    });
  }

  private setConfirmedData(data: T) {
    this.logger.trace({ ...this.baseLogContext, action: 'setConfirmedData()', data });
    this.confirmedData = data;
    setImmediate(() => {
      // allow other updates to finish before invoking subscription callback
      if (this.state !== ModelState.DISPOSED) {
        this.subscriptions.next({ confirmed: true, data });
      }
    });
  }

  private async applyUpdates(initialData: T, event: Event): Promise<T> {
    this.logger.trace({ ...this.baseLogContext, action: 'applyUpdates()', initialData, event });
    let data = initialData;
    const updates = this.updatesRegistry.get({ channel: event.channel, event: event.name });
    for (const update of updates) {
      data = await update.func(data, event);
    }
    return data;
  }

  private async applyOptimisticUpdates(initialData: T, event: OptimisticEvent) {
    const data = await this.applyUpdates(initialData, event);
    this.setOptimisticData(data);
  }

  private async applyConfirmedUpdates(initialData: T, event: ConfirmedEvent) {
    const data = await this.applyUpdates(initialData, event);
    this.setConfirmedData(data);
  }

  private async onStreamEvents(events: OptimisticEventWithParams[]) {
    for (const event of events) {
      await this.onStreamEvent(event);
    }
  }

  private async onStreamEvent(event?: OptimisticEventWithParams | ConfirmedEvent) {
    this.logger.trace({ ...this.baseLogContext, action: 'onStreamEvent()', event });
    if (!event) {
      return;
    }
    try {
      const updates = this.updatesRegistry.get({ channel: event.channel });
      if (!updates || updates.length === 0) {
        return;
      }
    } catch (err) {
      if (err instanceof UpdateRegistrationError) {
        return;
      }
      throw err;
    }

    // eagerly apply optimistic updates
    if (!event.confirmed) {
      this.optimisticEvents.push(event);
      await this.applyOptimisticUpdates(this.optimisticData, event);
      return;
    }

    this.confirmPendingEvents(event);

    // if the incoming confirmed event confirms the next expected optimistic event for the stream, it is
    // discarded without applying it to the speculative state because its effect has already been optimistically applied
    let unexpectedEvent = true;
    for (let i = 0; i < this.optimisticEvents.length; i++) {
      let e = this.optimisticEvents[i];
      if (e.params.comparator(e, event)) {
        this.optimisticEvents.splice(i, 1);
        await this.applyConfirmedUpdates(this.confirmedData, event);
        unexpectedEvent = false;
        break;
      }
    }

    // if the incoming confirmed event doesn't match any optimistic event,
    // we need to roll back to the last-confirmed state, apply the incoming event,
    // and rebase the optimistic updates on top
    if (unexpectedEvent) {
      await this.applyWithRebase(event, this.optimisticEvents);
    }
  }

  private async applyWithRebase(confirmedEvent: ConfirmedEvent, optimisticEvents: OptimisticEvent[]) {
    await this.applyConfirmedUpdates(this.confirmedData, confirmedEvent);
    let base = this.confirmedData;
    for (const event of optimisticEvents) {
      base = await this.applyUpdates(base, event);
    }
    this.setOptimisticData(base);
  }

  private addPendingConfirmation(events: OptimisticEvent[], timeout: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.logger.trace({ ...this.baseLogContext, action: 'addPendingConfirmation()', events, timeout });
      let pendingConfirmation = {
        unconfirmedEvents: [...events],
        resolve: resolve,
        reject: reject,
      } as PendingConfirmation;
      this.pendingConfirmations.push(pendingConfirmation);

      pendingConfirmation.timeout = setTimeout(async () => {
        await this.revertOptimisticEvents(pendingConfirmation.unconfirmedEvents);
        // Remove the pending confirmation.
        this.pendingConfirmations = this.pendingConfirmations.filter((p) => p !== pendingConfirmation);
        reject(new Error('timed out waiting for event confirmation'));
      }, timeout);
    });
  }

  private confirmPendingEvents(event: ConfirmedEvent) {
    this.logger.trace({ ...this.baseLogContext, action: 'confirmPendingEvents()', event });
    for (let pendingConfirmation of this.pendingConfirmations) {
      // Remove any unconfirmed events that have now been confirmed.
      pendingConfirmation.unconfirmedEvents = pendingConfirmation.unconfirmedEvents.filter(
        (e) => !e.params.comparator(e, event),
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

  private async revertOptimisticEvents(events: OptimisticEvent[]) {
    this.logger.trace({ ...this.baseLogContext, action: 'revertOptimisticEvents()', events });
    // Remove any events from optimisticEvents and re-apply any unconfirmed
    // optimistic events.
    for (let event of events) {
      this.optimisticEvents = this.optimisticEvents.filter((e) => !e.params.comparator(e, event));
    }
    let nextData = this.confirmedData;
    for (const e of this.optimisticEvents) {
      nextData = await this.applyUpdates(nextData, e);
    }
    this.setOptimisticData(nextData);
  }
}

export default Model;
