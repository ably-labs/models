import type { Logger } from 'pino';
import type { Types as AblyTypes } from 'ably/promises.js';
import { Subject, Subscription } from 'rxjs';
import { IStream } from './Stream.js';
import StreamRegistry from './StreamRegistry.js';
import EventEmitter from './utilities/EventEmitter.js';
import type { StandardCallback } from './types/callbacks';
import UpdatesRegistry, { UpdateFunc } from './UpdatesRegistry.js';
import MutationsRegistry, { MutationRegistration, MutationMethods, EventComparator } from './MutationsRegistry.js';
import { toError, UpdateRegistrationError } from './Errors.js';

/**
 * ModelState represents the possible lifecycle states of a model.
 */
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

/**
 * Represents a change event that can be applied to a model via an {@link UpdateFunc}.
 */
export type Event = {
  channel: string;
  name: string;
  data?: any;
};

/**
 * Parameters which can be used to decorate a specific event.
 */
export type EventParams = {
  /**
   * The time within which an optimistic event should be confirmed.
   */
  timeout: number;
  /**
   * A function used to correlate optimistic events with the confirmed counterparts.
   */
  comparator: EventComparator;
};

/**
 * An event that is emitted locally only in order to apply local optimistic updates to the model state.
 */
export type OptimisticEvent = Event & {
  confirmed: false;
};

/**
 * An event received from the backend over Ably that represents a confirmed mutation on the underlying state in the database.
 */
export type ConfirmedEvent = Event & {
  confirmed: true;
};

/**
 * Decorates an optimistic event with event-specific parameters.
 */
export type OptimisticEventWithParams = OptimisticEvent & {
  params: EventParams;
};

/**
 * Defines a function which the library will use to pull the latest state of the model from the backend.
 * Invoked on initialisation and whenever some discontinuity occurs that requires a re-sync.
 */
export type SyncFunc<T> = () => Promise<T>;

/**
 * Options used to configure a model instance.
 */
export type ModelOptions = {
  ably: AblyTypes.RealtimePromise;
  logger: Logger;
};

/**
 * A state transition emitted as an event from the model describing a change to the model's lifecycle.
 */
export type ModelStateChange = {
  current: ModelState;
  previous: ModelState;
  reason?: Error;
};

/**
 * Options used to configure a subscription to model data changes.
 */
export type SubscriptionOptions = {
  /**
   * If true, the subscription callback is invoked for local optimistic updates.
   * If false, it is invoked only with confirmed changes to the model data.
   */
  optimistic: boolean;
};

/**
 * A type used to capture the bulk registration of the required methods on the model.
 */
export type Registration<T, M extends MutationMethods> = {
  /**
   * The sync function used to pull the latest state of the model.
   */
  $sync: SyncFunc<T>;
  /**
   * A mapping of channel name to event to an update function that is invoked when a message
   * is received matching that channel and event name.
   */
  $update?: {
    [channel: string]: {
      [event: string]: UpdateFunc<T>;
    };
  };
  /**
   * A mapping of method names to mutations describing the mutations that are available on the model that
   * can be invoked to mutate the underlying state of the model in the backend database.
   */
  $mutate?: { [K in keyof M]: MutationRegistration<M[K]> };
};

type PendingConfirmation = {
  unconfirmedEvents: OptimisticEventWithParams[];
  timeout: ReturnType<typeof setTimeout>;
  resolve: () => void;
  reject: (err?: Error) => void;
};

/**
 * A Model encapsulates an observable, collaborative data model backed by a transactional database in your backend.
 *
 * It allows you to define a set of {@link MutationsRegistry.MutationFunc} on the model which typically trigger some backend endpoint
 * to mutate the model state in the database. Your backend is expected to emit ordered events that confirm this mutation.
 * The model will receive these events as {@link ConfirmedEvent}s and update the model's state in accordance with
 * some matching {@link UpdateFunc}.
 *
 * Additionally, mutations may emit {@link OptimisticEvent}s which are applied locally to generate an optimistic
 * view of your data, which must be confirmed within the configured timeout.
 *
 * @template T - The type of your data model.
 * @template M - The type of the mutation methods. This should be a map from method names to {@link MutationsRegistry.MutationFunc}.
 *
 * @extends {EventEmitter<Record<ModelState, ModelStateChange>>} Allows you to listen for {@link ModelStateChange} events to hook into the model lifecycle.
 */
export default class Model<T, M extends MutationMethods> extends EventEmitter<Record<ModelState, ModelStateChange>> {
  private wasRegistered = false;
  private currentState: ModelState = ModelState.INITIALIZED;
  private optimisticData!: T;
  private confirmedData!: T;

  private sync: SyncFunc<T> = async () => {
    throw new Error('sync func not registered');
  };
  private readonly streamRegistry: StreamRegistry;
  private readonly updatesRegistry: UpdatesRegistry<T> = new UpdatesRegistry<T>();
  private readonly mutationsRegistry: MutationsRegistry<M>;

  private optimisticEvents: OptimisticEventWithParams[] = [];
  private pendingConfirmations: PendingConfirmation[] = [];

  private readonly subscriptions = new Subject<{ confirmed: boolean; data: T }>();
  private subscriptionMap: WeakMap<StandardCallback<T>, Subscription> = new WeakMap();
  private streamSubscriptionsMap: WeakMap<IStream, StandardCallback<AblyTypes.Message>> = new WeakMap();

  private readonly logger: Logger;
  private readonly baseLogContext: Partial<{ scope: string; action: string }>;

  /**
   * @param {string} name - A unique name used to identify this model in your application.
   * @param {ModelOptions} options - Options used to configure this model instance.
   */
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

  /**
   * @returns {ModelState} The current state of the model.
   */
  public get state() {
    return this.currentState;
  }

  /**
   * @returns {T} The optimistic view of this model's data.
   */
  public get optimistic() {
    return this.optimisticData;
  }

  /**
   * @returns {T} The confirmed view of this model's data.
   */
  public get confirmed() {
    return this.confirmedData;
  }

  /**
   * @returns {MethodWithExpect<M>} The mutations handler that can be used to invoke the registered mutations on this model.
   */
  public get mutations() {
    return this.mutationsRegistry.handler;
  }

  /**
   * Pauses the current model by detaching from the underlying channels and pausing processing of updates.
   * @returns A promise that resolves when the model has been paused.
   */
  public async $pause() {
    this.logger.trace({ ...this.baseLogContext, action: 'pause()' });
    this.setState(ModelState.PAUSED);
    await Promise.all(Object.values(this.streamRegistry.streams).map((stream) => stream.pause()));
  }

  /**
   * Resumes the current model by re-synchronising and re-attaching to the underlying channels and resuming processing of updates.
   * @returns A promise that resolves when the model has been resumed.
   */
  public async $resume() {
    this.logger.trace({ ...this.baseLogContext, action: 'resume()' });
    await Promise.all(Object.values(this.streamRegistry.streams).map((stream) => stream.resume()));
    this.setState(ModelState.READY);
  }

  /**
   * Disposes of the model by detaching from the underlying channels and allowing all resources to be garbage collected.
   * After disposal, this model instance can no longer be used.
   * @param {Error?} reason - The optional reason for disposing the model.
   * @returns A promise that resolves when the model has been disposed.
   */
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
    this.subscriptionMap = new WeakMap();
    this.streamSubscriptionsMap = new WeakMap();
    return new Promise((resolve) => this.whenState(ModelState.DISPOSED, this.state, resolve));
  }

  /**
   * Registers a {@link SyncFunc}, a set of {@link UpdateFunc}s and {@link MutationsRegistry.MutationFunc}s for use by this model.
   * This should be called once by your application before you subscribe to the model state.
   * @param {Registration<T, M>} registration - The set of methods to register.
   * @returns A promise that resolves when the model has completed the registrtion and is ready to start emitting updates.
   */
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

  /**
   * Subscribes to changes to the data.
   * @param {(err: Error | null, result?: T) => void} callback - The callback to invoke with the latest data, or an error.
   * @param {SubscriptionOptions} options - Optional subscription options that can be used to specify whether to subscribe to
   * optimistic or only confirmed updates. Defaults to optimistic.
   */
  public subscribe(
    callback: (err: Error | null, result?: T) => void,
    options: SubscriptionOptions = { optimistic: true },
  ) {
    this.logger.trace({ ...this.baseLogContext, action: 'subscribe()', options });

    let timeout: NodeJS.Timeout;
    const subscription = this.subscriptions.subscribe({
      next: (value) => {
        this.logger.trace({ ...this.baseLogContext, action: 'next()', value });
        if (timeout) {
          clearTimeout(timeout);
        }
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
        if (timeout) {
          clearTimeout(timeout);
        }
        callback(err);
      },
      complete: () => {
        this.logger.trace({ ...this.baseLogContext, action: 'complete()' });
        this.unsubscribe(callback);
      },
    });
    this.subscriptionMap.set(callback, subscription);

    // subscribe callback invoked immediately with initial state
    timeout = setTimeout(() => callback(null, this.confirmedData), 0);
  }

  /**
   * Unsubscribes the given callback to changes to the data.
   * @param {(err: Error | null, result?: T) => void} callback - The callback to unsubscribe.
   */
  public unsubscribe(callback: (err: Error | null, result?: T) => void) {
    this.logger.trace({ ...this.baseLogContext, action: 'unsubscribe()' });
    const subscription = this.subscriptionMap.get(callback);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptionMap.delete(callback);
    }
  }

  private async onMutationEvents(events: OptimisticEventWithParams[]) {
    if (events.length === 0) {
      return [];
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
      Promise.all([optimistic, confirmation]).then(() => undefined),
    ];
  }

  private async onMutationError(err: Error, events: OptimisticEventWithParams[]) {
    this.logger.error({ ...this.baseLogContext, action: 'onMutationError()', err, events });
    if (events) {
      await this.revertOptimisticEvents(events);
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

    const data = await this.sync();
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
    this.streamSubscriptionsMap = new WeakMap();
  }

  private addStream(channel: string) {
    this.streamRegistry.streams[channel] = this.streamRegistry.getOrCreate({ channel });
    const callback: StandardCallback<AblyTypes.Message> = async (err: Error | null, event?: AblyTypes.Message) => {
      try {
        if (err) {
          throw err;
        }
        await this.onStreamEvent({ ...event!, channel, confirmed: true });
      } catch (err) {
        this.init(toError(err));
      }
    };
    this.streamRegistry.streams[channel].subscribe(callback);
    this.streamSubscriptionsMap.set(this.streamRegistry.streams[channel], callback);
  }

  private setOptimisticData(data: T) {
    this.logger.trace({ ...this.baseLogContext, action: 'setOptimisticData()', data });
    this.optimisticData = data;
    setTimeout(() => {
      // allow other updates to finish before invoking subscription callback
      if (this.state !== ModelState.DISPOSED) {
        this.subscriptions.next({ confirmed: false, data });
      }
    }, 0);
  }

  private setConfirmedData(data: T) {
    this.logger.trace({ ...this.baseLogContext, action: 'setConfirmedData()', data });
    this.confirmedData = data;
    setTimeout(() => {
      // allow other updates to finish before invoking subscription callback
      if (this.state !== ModelState.DISPOSED) {
        this.subscriptions.next({ confirmed: true, data });
      }
    }, 0);
  }

  private async applyUpdates(initialData: T, event: OptimisticEvent | ConfirmedEvent): Promise<T> {
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
      this.optimisticEvents.push(event as OptimisticEventWithParams);
      await this.applyOptimisticUpdates(this.optimisticData, event as OptimisticEventWithParams);
      return;
    }

    this.confirmPendingEvents(event);

    // If the incoming confirmed event confirms the next expected optimistic event for the stream,
    // the optimistic event is discarded before rolling back to the last-confirmed state, applying
    // the confirmed event and re-basing remaining optimistic events on top, so that we include any
    // additional data on the confirmed event in the updated data.
    for (let i = 0; i < this.optimisticEvents.length; i++) {
      let e = this.optimisticEvents[i];
      if (e.params.comparator(e, event)) {
        this.optimisticEvents.splice(i, 1);
        await this.applyWithRebase(event, this.optimisticEvents);
        return;
      }
    }

    // If the incoming confirmed event doesn't match any optimistic event, we roll back to the
    // last-confirmed state, apply the incoming event, and rebase the optimistic updates on top.
    await this.applyWithRebase(event, this.optimisticEvents);
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
