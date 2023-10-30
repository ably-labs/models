import type { Types as AblyTypes } from 'ably/promises.js';
import type { Logger } from 'pino';
import { Subject, Subscription } from 'rxjs';

import { toError } from './Errors.js';
import MutationsRegistry, { mutationIDComparator } from './MutationsRegistry.js';
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
import { MODELS_EVENT_REJECT_HEADER, MODELS_EVENT_UUID_HEADER, OptimisticEventOptions } from './types/optimistic.js';
import EventEmitter from './utilities/EventEmitter.js';
import { statePromise } from './utilities/promises.js';

/**
 * A Model encapsulates an observable, collaborative data model backed by a transactional database in your backend.
 *
 * Your backend is expected to emit ordered events that represent the state of changes to the model.
 * The model will receive these events as confirmed events and will merge these events into the existing state.
 *
 * Additionally, the Model supports optimistic events which are applied locally to generate an optimistic
 * view of your data, which must be confirmed by your backend within the configured timeout.
 *
 * @template T - The type of your data model.
 *
 * @extends {EventEmitter<Record<ModelState, ModelStateChange>>} Allows you to listen for model state changes to hook into the model lifecycle.
 */
export default class Model<T> extends EventEmitter<Record<ModelState, ModelStateChange>> {
  private currentState: ModelState = 'initialized';
  private optimisticData!: T;
  private confirmedData!: T;

  private syncFunc: SyncFunc<T> = async () => {
    throw new Error('sync func not registered');
  };
  private merge: MergeFunc<T> = async () => {
    throw new Error('merge func not registered');
  };

  private readonly stream: IStream;
  private readonly streamFactory: IStreamFactory;
  private readonly mutationsRegistry: MutationsRegistry;

  private optimisticEvents: OptimisticEventWithParams[] = [];
  private pendingConfirmationRegistry: PendingConfirmationRegistry = new PendingConfirmationRegistry(
    mutationIDComparator,
  );

  private readonly subscriptions = new Subject<{ confirmed: boolean; data: T }>();
  private subscriptionMap: WeakMap<StandardCallback<T>, Subscription> = new WeakMap();
  private streamSubscriptionsMap: WeakMap<IStream, StandardCallback<AblyTypes.Message>> = new WeakMap();

  private readonly logger: Logger;
  private readonly baseLogContext: Partial<{ scope: string; action: string }>;

  private detachedAt: number | null = null;
  private lastSeenSequenceID: string | null = null;

  /**
   * @param {string} name - A unique name used to identify this model in your application.
   * @param {ModelOptions} options - Options used to configure this model instance.
   */
  constructor(readonly name: string, registration: Registration<T>, readonly options: ModelOptions) {
    super();
    this.logger = this.options.logger;
    this.baseLogContext = { scope: `Model:${name}` };

    this.streamFactory = new StreamFactory({
      ably: this.options.ably,
      logger: this.options.logger,
      syncOptions: this.options.syncOptions,
      eventBufferOptions: this.options.eventBufferOptions,
    });
    this.stream = this.streamFactory.newStream({ channelName: this.options.channelName });

    this.mutationsRegistry = new MutationsRegistry(
      {
        apply: this.applyOptimisticEvents.bind(this),
        rollback: this.rollbackOptimisticEvents.bind(this),
      },
      this.options.optimisticEventOptions,
    );

    this.syncFunc = registration.sync;
    this.merge = registration.merge;
  }

  /**
   * @returns {ModelState} The current state of the model.
   */
  public get state() {
    return this.currentState;
  }

  /**
   * @returns The an object giving access to the optimistic and confirmed state of the model.
   */
  public get data() {
    const self = this;

    return {
      get optimistic() {
        return self.optimisticData;
      },
      get confirmed() {
        return self.confirmedData;
      },
    };
  }

  /**
   * The optimistic function that allows optimistic events to be included in the model state.
   * Optimistic events are expected to be confirmed by later confirmed events consumed on the channel.
   * @param {string} mutationID - The identifier for this mutation. This ID will be used to match this
   * optimistic event against a confirmed event received on the channel.
   * @param {Event} event - The event to apply optimistically.
   * @param {Partial<OptimisticEventOptions>} options - Options for handling this specific optimisitic event.
   * @returns {Promise<[Promise<void>,() => void]>} A Promise that resolves to a [confirmed, cancel] tuple
   * when the model has successfully applied the optimistic update. The confirmed field from the tuple is a
   * promise that resolves when the optimistic event is confirmed. The cancel field from the tuple is a
   * function that can be used to trigger the rollback of the optimistic event.
   */
  public optimistic(
    event: Omit<OptimisticEvent, 'confirmed'>,
    options?: Partial<OptimisticEventOptions>,
  ): Promise<[Promise<void>, () => Promise<void>]> {
    const clone: OptimisticEvent = Object.assign({}, event, { confirmed: false } as { confirmed: false });
    return this.mutationsRegistry.handleOptimistic(clone, options);
  }

  /**
   * The sync function that allows the model to be manually resynced
   * @returns A promise that resolves when the model has successfully re-synchronised its state and is ready to start emitting updates.
   */
  public async sync() {
    await this.resync();
    return statePromise(this, 'ready');
  }

  /**
   * Pauses the current model by detaching from the underlying channels and pausing processing of updates.
   * If the model is already paused this is a no-op.
   * @returns A promise that resolves when the model has been paused.
   */
  public async pause() {
    if (this.currentState === 'paused') {
      return;
    }
    this.logger.trace({ ...this.baseLogContext, action: 'pause()' });
    this.detachedAt = this.now();
    await this.stream.reset();
    this.setState('paused');
  }

  /**
   * Resumes the current model by re-synchronising and re-attaching to the underlying channels and resuming processing of updates.
   * @returns A promise that resolves when the model has been resumed.
   */
  public async resume() {
    if (this.currentState !== 'paused') {
      throw new Error(`can only resume when in paused state: ${this.currentState}`);
    }
    this.logger.trace({ ...this.baseLogContext, action: 'resume()' });
    let interval: number;
    switch (this.options.syncOptions.messageRetentionPeriod) {
      case '2m':
        interval = 2 * 60 * 1000;
        break;
      case '24h':
        interval = 24 * 60 * 60 * 1000;
        break;
      case '72h':
        interval = 72 * 60 * 60 * 1000;
        break;
    }
    const margin = 5000; // 5 second margin to reduce chance of messages expiring while paginating through history
    if (!this.lastSeenSequenceID || !this.detachedAt || this.now() - this.detachedAt >= interval - margin) {
      await this.resync();
      this.detachedAt = null;
      return;
    }
    try {
      await this.stream.replay(this.lastSeenSequenceID);
    } catch (err) {
      this.logger.warn('unable to replay from last seen sequenceID, will resync', {
        ...this.baseLogContext,
        action: 'resume()',
        sequenceID: this.lastSeenSequenceID,
      });
      await this.resync();
    }
    this.detachedAt = null;
    this.setState('ready');
  }

  /**
   * Disposes of the model by detaching from the underlying channels and allowing all resources to be garbage collected.
   * After disposal, this model instance can no longer be used.
   * @param {Error?} reason - The optional reason for disposing the model.
   * @returns A promise that resolves when the model has been disposed.
   */
  public async dispose(reason?: Error) {
    this.logger.trace({ ...this.baseLogContext, action: 'dispose()', reason });
    this.setState('disposed', reason);
    this.lastSeenSequenceID = null;
    this.detachedAt = null;
    this.subscriptions.unsubscribe();

    const callback = this.streamSubscriptionsMap.get(this.stream);
    if (callback) {
      this.stream.unsubscribe(callback);
    }

    await this.pendingConfirmationRegistry.finalise(reason);
    this.subscriptionMap = new WeakMap();
    this.streamSubscriptionsMap = new WeakMap();
    await this.stream.dispose();
    return new Promise((resolve) => this.whenState('disposed', this.state, resolve));
  }

  /**
   * Subscribes to changes to the data. If the model has not been started yet by calling
   * model.sync(), subscribe will start the model by calling sync().
   * @param {(err: Error | null, result?: T) => void} callback - The callback to invoke with the latest data, or an error.
   * @param {SubscriptionOptions} options - Optional subscription options that can be used to specify whether to subscribe to
   * optimistic or only confirmed updates. Defaults to optimistic.
   */
  public async subscribe(
    callback: (err: Error | null, result?: T) => void,
    options: SubscriptionOptions = { optimistic: true },
  ) {
    this.logger.trace({ ...this.baseLogContext, action: 'subscribe()', options });

    if (this.state === 'initialized') {
      await this.sync();
    }

    if (this.state === 'disposed') {
      throw new Error('Cannot subscribe to a disposed model');
    }

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

  // support overriding this method to faciltate testing
  protected now(): number {
    return Date.now();
  }

  private async applyOptimisticEvents(events: OptimisticEventWithParams[]) {
    if (events.length === 0) {
      return [];
    }

    if (!events.every((event) => event.params.timeout === events[0].params.timeout)) {
      throw new Error('expected every optimistic event in batch to have the same timeout');
    }
    const pendingConfirmation = await this.pendingConfirmationRegistry.add(events);
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

  private async resync(reason?: Error) {
    this.logger.trace({ ...this.baseLogContext, action: 'resync()', reason });
    this.setState('syncing', reason);
    this.removeStream();
    const { data, sequenceID } = await this.syncFunc();
    this.setConfirmedData(data);
    await this.rebase(this.optimisticEvents);
    await this.addStream(sequenceID);
    this.setState('ready');
  }

  private removeStream() {
    const callback = this.streamSubscriptionsMap.get(this.stream);
    if (callback) {
      this.stream.unsubscribe(callback);
    }
    this.stream.dispose();
    this.streamSubscriptionsMap.delete(this.stream);
  }

  private async addStream(sequenceID: string) {
    const callback = this.onStreamMessage.bind(this);
    this.stream.subscribe(callback);
    this.streamSubscriptionsMap.set(this.stream, callback);
    await this.stream.replay(sequenceID);
  }

  private async onStreamMessage(err: Error | null, event?: AblyTypes.Message) {
    try {
      if (err) {
        throw err;
      }
      let rejected = false;
      if (event?.extras?.headers && event?.extras?.headers[MODELS_EVENT_REJECT_HEADER] === 'true') {
        rejected = true;
      }

      const mutationID = event?.extras?.headers[MODELS_EVENT_UUID_HEADER];
      if (!mutationID) {
        this.logger.warn(
          { ...this.baseLogContext, action: 'streamEventCallback' },
          `message does not have "${MODELS_EVENT_UUID_HEADER}" header, skipping message id`,
          event?.id,
        );
        return;
      }

      const modelsEvent: ConfirmedEvent = {
        ...event!,
        confirmed: true,
        rejected,
        mutationID: mutationID,
        sequenceID: event.id,
      };

      await this.onStreamEvent(modelsEvent);
    } catch (err) {
      await this.resync(toError(err));
    }
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

    // eagerly apply optimistic updates
    if (!event.confirmed) {
      this.optimisticEvents.push(event as OptimisticEventWithParams);
      await this.applyOptimisticUpdate(this.optimisticData, event as OptimisticEventWithParams);
      return;
    }

    this.lastSeenSequenceID = event.sequenceID;

    await this.confirmPendingEvents(event);

    // If the incoming confirmed event confirms the next expected optimistic event for the stream,
    // the optimistic event is discarded before rolling back to the last-confirmed state, applying
    // the confirmed event and re-basing remaining optimistic events on top, so that we include any
    // additional data on the confirmed event in the updated data.
    for (let i = 0; i < this.optimisticEvents.length; i++) {
      let e = this.optimisticEvents[i];
      if (mutationIDComparator(e, event)) {
        this.optimisticEvents.splice(i, 1);
        await this.applyConfirmedUpdateWithRebase(event, this.optimisticEvents);
        return;
      }
    }

    // If the incoming confirmed event doesn't match any optimistic event, we roll back to the
    // last-confirmed state, apply the incoming event, and rebase the optimistic updates on top.
    await this.applyConfirmedUpdateWithRebase(event, this.optimisticEvents);
  }

  private async rebase(optimisticEvents: OptimisticEvent[]) {
    let base = this.confirmedData;
    for (const event of optimisticEvents) {
      base = await this.applyUpdate(base, event);
    }
    this.setOptimisticData(base);
  }

  private async applyConfirmedUpdateWithRebase(confirmedEvent: ConfirmedEvent, optimisticEvents: OptimisticEvent[]) {
    if (confirmedEvent.rejected) {
      return;
    }
    await this.applyConfirmedUpdate(this.confirmedData, confirmedEvent);
    await this.rebase(optimisticEvents);
  }

  private async confirmPendingEvents(event: ConfirmedEvent) {
    this.logger.trace({ ...this.baseLogContext, action: 'confirmPendingEvents()', event });
    await this.pendingConfirmationRegistry.confirmEvents([event]);
  }

  private async revertOptimisticEvents(err: Error, events: OptimisticEvent[]) {
    if (events.length === 0) {
      return;
    }
    this.logger.trace({ ...this.baseLogContext, action: 'revertOptimisticEvents()', events });
    // remove any matching events from the optimisticEvents and re-apply the remaining events
    // on top of the latest confirmed state
    for (let event of events) {
      this.optimisticEvents = this.optimisticEvents.filter((e) => !mutationIDComparator(e, event));
    }
    await this.rebase(this.optimisticEvents);
    await this.pendingConfirmationRegistry.rejectEvents(err, events);
  }
}
