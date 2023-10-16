import type { Types as AblyTypes } from 'ably/promises.js';
import type { Logger } from 'pino';
import { Subject, Subscription } from 'rxjs';

import { toError } from './Errors.js';
import MutationsRegistry from './MutationsRegistry.js';
import PendingConfirmationRegistry from './PendingConfirmationRegistry.js';
import { IStream } from './stream/Stream.js';
import StreamFactory, { IStreamFactory as IStreamFactory } from './stream/StreamFactory.js';
import type { StandardCallback } from './types/callbacks';
import { MergeFunc } from './types/merge.js';
import type {
  OptimisticEventWithParams,
  ModelState,
  ModelStateChange,
  ModelOptions,
  SyncFunc,
  Registration,
  SubscriptionOptions,
  OptimisticEvent,
  ConfirmedEvent,
} from './types/model.js';
import type { MutationMethods } from './types/mutations.js';
import EventEmitter from './utilities/EventEmitter.js';

/**
 * A Model encapsulates an observable, collaborative data model backed by a transactional database in your backend.
 *
 * It allows you to define a set of mutation functions on the model which typically trigger some backend endpoint
 * to mutate the model state in the database. Your backend is expected to emit ordered events that confirm this mutation.
 * The model will receive these events as confirmed events and update the model's state in accordance with
 * some matching update functions.
 *
 * Additionally, mutations may emit optimistic events which are applied locally to generate an optimistic
 * view of your data, which must be confirmed within the configured timeout.
 *
 * @template T - The type of your data model.
 * @template M - The type of the mutation methods. This should be a map from method names to mutations.
 *
 * @extends {EventEmitter<Record<ModelState, ModelStateChange>>} Allows you to listen for model state changes to hook into the model lifecycle.
 */
export default class Model<T, M extends MutationMethods> extends EventEmitter<Record<ModelState, ModelStateChange>> {
  private wasRegistered = false;
  private currentState: ModelState = 'initialized';
  private optimisticData!: T;
  private confirmedData!: T;

  private syncFunc: SyncFunc<T> = async () => {
    throw new Error('sync func not registered');
  };
  private merge?: MergeFunc<T>;

  private readonly stream: IStream;
  private readonly streamFactory: IStreamFactory;
  private readonly mutationsRegistry: MutationsRegistry<M>;

  private optimisticEvents: OptimisticEventWithParams[] = [];
  private pendingConfirmationsRegistry: PendingConfirmationRegistry = new PendingConfirmationRegistry();

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
    this.baseLogContext = { scope: `Model:${name}` };

    this.streamFactory = new StreamFactory({
      ably: options.ably,
      logger: options.logger,
      eventBufferOptions: options.eventBufferOptions,
    });
    this.stream = this.streamFactory.newStream({ channel: options.channelName });

    this.mutationsRegistry = new MutationsRegistry<M>(
      {
        apply: this.applyOptimisticEvents.bind(this),
        rollback: this.rollbackOptimisticEvents.bind(this),
      },
      options.defaultMutationOptions,
    );
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
   * The sync function that allows the model to be manually resynced
   * @returns A promise that resolves when the model has successfully re-synchronised its state and is ready to start emitting updates.
   */
  public get $sync() {
    return () => {
      this.init();
      return new Promise((resolve) => this.whenState('ready', this.state, resolve));
    };
  }

  /**
   * Pauses the current model by detaching from the underlying channels and pausing processing of updates.
   * @returns A promise that resolves when the model has been paused.
   */
  public async $pause() {
    this.logger.trace({ ...this.baseLogContext, action: 'pause()' });
    await this.stream.pause();
    this.setState('paused');
  }

  /**
   * Resumes the current model by re-synchronising and re-attaching to the underlying channels and resuming processing of updates.
   * @returns A promise that resolves when the model has been resumed.
   */
  public async $resume() {
    this.logger.trace({ ...this.baseLogContext, action: 'resume()' });
    await this.stream.resume();
    this.setState('ready');
  }

  /**
   * Disposes of the model by detaching from the underlying channels and allowing all resources to be garbage collected.
   * After disposal, this model instance can no longer be used.
   * @param {Error?} reason - The optional reason for disposing the model.
   * @returns A promise that resolves when the model has been disposed.
   */
  public async $dispose(reason?: Error) {
    this.logger.trace({ ...this.baseLogContext, action: 'dispose()', reason });
    this.setState('disposed', reason);
    this.subscriptions.unsubscribe();

    const callback = this.streamSubscriptionsMap.get(this.stream);
    if (callback) {
      this.stream.unsubscribe(callback);
    }

    await this.pendingConfirmationsRegistry.finalise(reason);
    this.subscriptionMap = new WeakMap();
    this.streamSubscriptionsMap = new WeakMap();
    return new Promise((resolve) => this.whenState('disposed', this.state, resolve));
  }

  /**
   * Registers a sync function, a merge function and a set of mutations for use by this model.
   * This should be called once by your application before you subscribe to the model state.
   * @param {Registration<T, M>} registration - The set of methods to register.
   * @returns A promise that resolves when the model has completed the registrtion and is ready to start emitting updates.
   */
  public $register(registration: Registration<T, M>) {
    if (this.wasRegistered) {
      throw new Error('$register was already called');
    }
    if (this.state !== 'initialized') {
      throw new Error(
        `$register can only be called when the model is in the ${'initialized'} state (current: ${this.state})`,
      );
    }
    this.wasRegistered = true;
    this.syncFunc = registration.$sync;

    if (registration.$merge) {
      this.merge = registration.$merge;
    }

    if (registration.$mutate) {
      this.mutationsRegistry.register(registration.$mutate);
    }
    this.init();
    return new Promise((resolve) => this.whenState('ready', this.state, resolve));
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

  private async applyOptimisticEvents(events: OptimisticEventWithParams[]) {
    if (events.length === 0) {
      return [];
    }

    for (const event of events) {
      if (event.channel !== this.stream.channel) {
        throw new Error(`stream with name '${event.channel}' not registered on model '${this.name}'`);
      }
    }

    if (!events.every((event) => event.params.timeout === events[0].params.timeout)) {
      throw new Error('expected every optimistic event in batch to have the same timeout');
    }
    const pendingConfirmation = await this.pendingConfirmationsRegistry.add(events);
    const optimistic = this.onStreamEvents(events);
    return [optimistic, pendingConfirmation.promise];
  }

  private async rollbackOptimisticEvents(err: Error, events: OptimisticEventWithParams[]) {
    this.logger.info({ ...this.baseLogContext, action: 'rollbackOptimisticEvents()', err, events });
    await this.revertOptimisticEvents(err, events);
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
    this.setState('preparing', reason);

    this.removeStream();
    this.addStream(this.stream.channel);

    const data = await this.syncFunc();
    this.setOptimisticData(data);
    this.setConfirmedData(data);
    this.setState('ready');
  }

  private removeStream() {
    this.stream.reset();
    const callback = this.streamSubscriptionsMap.get(this.stream);
    if (callback) {
      this.stream.unsubscribe(callback);
    }
    this.stream.reset();
    this.streamSubscriptionsMap = new WeakMap();
  }

  private addStream(channel: string) {
    const callback: StandardCallback<AblyTypes.Message> = async (err: Error | null, event?: AblyTypes.Message) => {
      try {
        if (err) {
          throw err;
        }
        let rejected = false;
        if (event?.extras?.headers && event?.extras?.headers['x-ably-models-reject'] === 'true') {
          rejected = true;
        }
        let uuid: string | undefined;
        if (event?.extras?.headers && !!event?.extras?.headers['x-ably-models-event-uuid']) {
          uuid = event?.extras?.headers['x-ably-models-event-uuid'];
        }
        await this.onStreamEvent({ ...event!, channel, confirmed: true, rejected, ...(uuid && { uuid }) });
      } catch (err) {
        this.init(toError(err));
      }
    };
    this.stream.subscribe(callback);
    this.streamSubscriptionsMap.set(this.stream, callback);
  }

  private setOptimisticData(data: T) {
    this.logger.trace({ ...this.baseLogContext, action: 'setOptimisticData()', data });
    this.optimisticData = data;
    setTimeout(() => {
      // allow other updates to finish before invoking subscription callback
      if (this.state !== 'disposed') {
        this.subscriptions.next({ confirmed: false, data });
      }
    }, 0);
  }

  private setConfirmedData(data: T) {
    this.logger.trace({ ...this.baseLogContext, action: 'setConfirmedData()', data });
    this.confirmedData = data;
    setTimeout(() => {
      // allow other updates to finish before invoking subscription callback
      if (this.state !== 'disposed') {
        this.subscriptions.next({ confirmed: true, data });
      }
    }, 0);
  }

  private async applyUpdate(initialData: T, event: OptimisticEvent | ConfirmedEvent): Promise<T> {
    this.logger.trace({ ...this.baseLogContext, action: 'applyUpdate()', initialData, event });
    if (!this.merge) {
      throw new Error('merge func not registered');
    }
    const data = await this.merge(initialData, event);
    return data;
  }

  private async applyOptimisticUpdate(initialData: T, event: OptimisticEvent) {
    const data = await this.applyUpdate(initialData, event);
    this.setOptimisticData(data);
  }

  private async applyConfirmedUpdate(initialData: T, event: ConfirmedEvent) {
    const data = await this.applyUpdate(initialData, event);
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

    if (!this.merge) {
      return;
    }

    // eagerly apply optimistic updates
    if (!event.confirmed) {
      this.optimisticEvents.push(event as OptimisticEventWithParams);
      await this.applyOptimisticUpdate(this.optimisticData, event as OptimisticEventWithParams);
      return;
    }

    await this.confirmPendingEvents(event);

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
    if (confirmedEvent.rejected) {
      return;
    }
    await this.applyConfirmedUpdate(this.confirmedData, confirmedEvent);
    let base = this.confirmedData;
    for (const event of optimisticEvents) {
      base = await this.applyUpdate(base, event);
    }
    this.setOptimisticData(base);
  }

  private async confirmPendingEvents(event: ConfirmedEvent) {
    this.logger.trace({ ...this.baseLogContext, action: 'confirmPendingEvents()', event });
    await this.pendingConfirmationsRegistry.confirmEvents([event]);
  }

  private async revertOptimisticEvents(err: Error, events: OptimisticEvent[]) {
    if (events.length === 0) {
      return;
    }
    this.logger.trace({ ...this.baseLogContext, action: 'revertOptimisticEvents()', events });
    // remove any matching events from the optimisticEvents and re-apply the remaining events
    // on top of the latest confirmed state
    for (let event of events) {
      this.optimisticEvents = this.optimisticEvents.filter((e) => !e.params.comparator(e, event));
    }
    let nextData = this.confirmedData;
    for (const e of this.optimisticEvents) {
      nextData = await this.applyUpdate(nextData, e);
    }
    this.setOptimisticData(nextData);
    await this.pendingConfirmationsRegistry.rejectEvents(err, events);
  }
}
