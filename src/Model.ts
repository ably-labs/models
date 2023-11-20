import type { Types as AblyTypes } from 'ably/promises.js';
import type { Logger } from 'pino';
import { Subject, Subscription } from 'rxjs';

import { StreamDiscontinuityError, InvalidArgumentError, toError } from './Errors.js';
import EventQueue from './EventQueue.js';
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
  Registration,
  SubscriptionOptions,
  OptimisticEvent,
  ConfirmedEvent,
  ExtractData,
  SyncFuncConstraint,
} from './types/model.js';
import {
  MODELS_EVENT_REJECT_HEADER,
  MODELS_EVENT_UUID_HEADER,
  OptimisticEventOptions,
  RetryStrategyFunc,
} from './types/optimistic.js';
import EventEmitter from './utilities/EventEmitter.js';
import { statePromise } from './utilities/promises.js';
import { backoffRetryStrategy, fixedRetryStrategy } from './utilities/retries.js';

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
export default class Model<S extends SyncFuncConstraint> extends EventEmitter<Record<ModelState, ModelStateChange>> {
  private currentState: ModelState = 'initialized';
  private optimisticData!: ExtractData<S>;
  private confirmedData!: ExtractData<S>;

  private syncRetryStrategy: RetryStrategyFunc;
  private syncFunc: S;
  private lastSyncParams?: Parameters<S>;
  private merge: MergeFunc<ExtractData<S>> = async () => {
    throw new Error('merge func not registered');
  };

  private readonly stream: IStream;
  private readonly streamFactory: IStreamFactory;
  private readonly mutationsRegistry: MutationsRegistry;

  private optimisticEvents: OptimisticEventWithParams[] = [];
  private pendingConfirmationRegistry: PendingConfirmationRegistry = new PendingConfirmationRegistry(
    mutationIDComparator,
  );

  private readonly subscriptions = new Subject<{ confirmed: boolean; data: ExtractData<S> }>();
  private subscriptionMap: WeakMap<StandardCallback<ExtractData<S>>, Subscription> = new WeakMap();
  private streamSubscriptionsMap: WeakMap<IStream, StandardCallback<AblyTypes.Message>> = new WeakMap();

  private eventQueue: EventQueue;

  private readonly logger: Logger;
  private readonly baseLogContext: Partial<{ scope: string; action: string }>;

  private detachedAt: number | null = null;
  private lastSeenSequenceID: string | null = null;

  /**
   * @param {string} name - A unique name used to identify this model in your application.
   * @param {ModelOptions} options - Options used to configure this model instance.
   */
  constructor(readonly name: string, registration: Registration<S>, readonly options: ModelOptions) {
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

    this.syncRetryStrategy = options.syncOptions.retryStrategy || backoffRetryStrategy(2, 1000, 10);
    if (!registration.sync) {
      throw new Error('sync func not registered');
    }
    this.syncFunc = registration.sync;
    this.merge = registration.merge;

    this.eventQueue = new EventQueue(this.logger, this.onStreamEvent.bind(this));
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
    if (!this.isEvent(event)) {
      throw new InvalidArgumentError('expected event to be an Event');
    }

    if (options && typeof options !== 'object') {
      throw new InvalidArgumentError('expected options to be an object');
    }

    this.logger.trace({ ...this.baseLogContext, action: 'optimistic()', event, options });
    const clone: OptimisticEvent = Object.assign({}, event, { confirmed: false } as { confirmed: false });
    return this.mutationsRegistry.handleOptimistic(clone, options);
  }

  private isEvent(event: any): event is Event {
    return (
      event && event.name && typeof event.name === 'string' && event.mutationID && typeof event.mutationID === 'string'
    );
  }

  /**
   * The sync function that allows the model to be manually resynced
   * @returns A promise that resolves when the model has successfully re-synchronised its state and is ready to start emitting updates.
   */
  public async sync(...params: Parameters<S>) {
    this.logger.trace({ ...this.baseLogContext, action: 'sync()', params });
    this.lastSyncParams = params;
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
    this.eventQueue.reset();
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
      this.logger.trace('resyncing without replay attempt', {
        ...this.baseLogContext,
        action: 'resume()',
        lastSeenSequenceID: this.lastSeenSequenceID,
        interval,
        detachedAt: this.detachedAt,
      });
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
    callback: (err: Error | null, result?: ExtractData<S>) => void,
    options: SubscriptionOptions = { optimistic: true },
  ) {
    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('Expected callback to be a function');
    }
    if (options && (typeof options !== 'object' || typeof options.optimistic !== 'boolean')) {
      throw new InvalidArgumentError('Expected options to be a SubscriptionOptions');
    }

    this.logger.trace({ ...this.baseLogContext, action: 'subscribe()', options });

    if (this.state === 'initialized') {
      await this.sync(...(this.lastSyncParams || ([] as unknown as Parameters<S>)));
    }

    if (this.state === 'disposed') {
      throw new Error('Cannot subscribe to a disposed model');
    }

    const errorHandledCallback = (err: Error | null, result?: ExtractData<S>) => {
      try {
        callback(err, result);
      } catch (error) {
        this.logger.warn(
          { ...this.baseLogContext, action: 'subscribe', error },
          'error thrown from model.subscribe(...) callback',
        );
      }
    };

    let timeout: NodeJS.Timeout;
    const subscription = this.subscriptions.subscribe({
      next: (value) => {
        this.logger.trace({ ...this.baseLogContext, action: 'next()', value });
        if (timeout) {
          clearTimeout(timeout);
        }
        if (options.optimistic && !value.confirmed) {
          errorHandledCallback(null, value.data);
          return;
        }
        if (!options.optimistic && value.confirmed) {
          errorHandledCallback(null, value.data);
          return;
        }
      },
      error: (err) => {
        this.logger.trace({ ...this.baseLogContext, action: 'error()', err });
        if (timeout) {
          clearTimeout(timeout);
        }
        errorHandledCallback(err);
      },
      complete: () => {
        this.logger.trace({ ...this.baseLogContext, action: 'complete()' });
        this.unsubscribe(errorHandledCallback);
      },
    });
    this.subscriptionMap.set(errorHandledCallback, subscription);

    // subscribe callback invoked immediately with initial state
    timeout = setTimeout(() => errorHandledCallback(null, this.confirmedData), 0);
  }

  /**
   * Unsubscribes the given callback to changes to the data.
   * @param {(err: Error | null, result?: T) => void} callback - The callback to unsubscribe.
   */
  public unsubscribe(callback: (err: Error | null, result?: ExtractData<S>) => void) {
    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('Expected callback to be a function');
    }

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

  private async retryable(retries: RetryStrategyFunc, fn: () => Promise<void>) {
    let i = 1;
    let delay = retries(1);

    if (delay < 0) {
      await fn();
      return;
    }

    while (delay > 0) {
      try {
        await fn();
        return;
      } catch (err) {
        delay = retries(++i);
        if (delay < 0) {
          throw err;
        }
        this.logger.warn('retryable function failed, scheduling retry', {
          ...this.baseLogContext,
          action: 'retryable()',
          delay,
          attempt: i,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // This should be unreachable
    throw new Error('too many retries');
  }

  private async resync(reason?: Error) {
    this.setState('syncing', reason);

    const fn = async () => {
      this.logger.trace('attempting to resync...', {
        ...this.baseLogContext,
        action: 'resync()',
        reason,
        lastSyncParams: this.lastSyncParams,
      });
      this.removeStream();
      const { data, sequenceID } = await this.syncFunc(...(this.lastSyncParams || ([] as unknown as Parameters<S>)));
      this.setConfirmedData(data);
      await this.computeState(this.confirmedData, this.optimisticData, this.optimisticEvents);
      await this.addStream(sequenceID);
      this.setState('ready');
    };

    try {
      await this.retryable(this.syncRetryStrategy, fn);
    } catch (err) {
      this.logger.error('retries exhausted', { ...this.baseLogContext, action: 'resync()', err });
      this.setState('errored', toError(err));
      throw err;
    }
  }

  private removeStream() {
    // no need to remove the stream if it's not yet attached to the channel
    if (this.stream.state === 'initialized') {
      return;
    }
    this.eventQueue.reset();
    this.logger.trace({ ...this.baseLogContext, action: 'removeStream()' });
    const callback = this.streamSubscriptionsMap.get(this.stream);
    if (callback) {
      this.stream.unsubscribe(callback);
    }
    this.stream.dispose();
    this.streamSubscriptionsMap.delete(this.stream);
  }

  private async addStream(sequenceID: string) {
    this.logger.trace({ ...this.baseLogContext, action: 'addStream()', sequenceID });
    const callback = this.onStreamMessage.bind(this);
    this.stream.subscribe(callback);
    this.streamSubscriptionsMap.set(this.stream, callback);
    await this.stream.replay(sequenceID);
  }

  private async onStreamMessage(err: Error | null, event?: AblyTypes.Message) {
    if (err) {
      await this.handleOnStreamMessageError(toError(err));
      return;
    }
    this.logger.trace({ ...this.baseLogContext, action: 'onStreamMessage()', err, event });
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

    this.eventQueue.enqueue(modelsEvent);
  }

  private async handleOnStreamMessageError(err: Error) {
    try {
      this.logger.error('handle stream message failed, attempting to resume or resync...', {
        ...this.baseLogContext,
        action: 'handleOnStreamMessageError()',
        err,
      });

      if (err instanceof StreamDiscontinuityError) {
        await this.handleErrorResume();
        return;
      }

      await this.resync(toError(err));
    } catch (err) {
      this.logger.warn(
        'failed to resync model after error handling stream message, pausing model and attempting to resume',
        { ...this.baseLogContext, action: 'streamEventCallback', err },
      );
      await this.handleErrorResume();
    }
  }

  private async handleErrorResume() {
    this.logger.trace(
      { ...this.baseLogContext, action: 'handleErrorResume()' },
      'pausing the model, will resume or resync',
    );
    const delay = 15_000;
    const fn = async () => {
      try {
        await this.pause();
        await this.resume();
        return;
      } catch (err) {
        this.logger.warn(`failed to resume model after error handling stream message, retrying in ${delay}`, {
          ...this.baseLogContext,
          action: 'handleErrorResume',
          err,
        });

        throw err;
      }
    };
    await this.retryable(fixedRetryStrategy(delay), fn);
  }

  private setOptimisticData(data: ExtractData<S>) {
    this.logger.trace({ ...this.baseLogContext, action: 'setOptimisticData()', data });
    this.optimisticData = data;
    setTimeout(() => {
      // allow other updates to finish before invoking subscription callback
      if (this.state !== 'disposed') {
        this.subscriptions.next({ confirmed: false, data });
      }
    }, 0);
  }

  private setConfirmedData(data: ExtractData<S>) {
    this.logger.trace({ ...this.baseLogContext, action: 'setConfirmedData()', data });
    this.confirmedData = data;
    setTimeout(() => {
      // allow other updates to finish before invoking subscription callback
      if (this.state !== 'disposed') {
        this.subscriptions.next({ confirmed: true, data });
      }
    }, 0);
  }

  private async applyUpdate(
    initialData: ExtractData<S>,
    event: OptimisticEvent | ConfirmedEvent,
  ): Promise<ExtractData<S>> {
    const data = await this.merge(initialData, event);
    this.logger.trace({ ...this.baseLogContext, action: 'applyUpdate()', initialData, event, data });
    return data;
  }

  private async computeState(
    confirmedData: ExtractData<S>,
    optimisticData: ExtractData<S>,
    optimisticEvents: OptimisticEvent[],
    event?: OptimisticEvent | ConfirmedEvent,
  ) {
    this.logger.trace({
      ...this.baseLogContext,
      action: 'computeState()',
      confirmedData,
      optimisticData,
      optimisticEvents,
      event,
    });
    const optimisticEvent = event && !event.confirmed;
    const confirmedEvent = event && event.confirmed;
    const noEvent = !event;

    if (optimisticEvent) {
      this.logger.trace('handling optimistic event', {
        ...this.baseLogContext,
        action: 'computeState()',
        confirmedData,
        optimisticData,
        optimisticEvents,
        event,
      });
      const data = await this.applyUpdate(optimisticData, event);
      this.setOptimisticData(data);
      return;
    }

    if (confirmedEvent) {
      if (event.rejected) {
        this.logger.trace('handling rejection event', {
          ...this.baseLogContext,
          action: 'computeState()',
          confirmedData,
          optimisticData,
          optimisticEvents,
          event,
        });
        return;
      }
      this.logger.trace('handling confirmation event', {
        ...this.baseLogContext,
        action: 'computeState()',
        confirmedData,
        optimisticData,
        optimisticEvents,
        event,
      });
      const data = await this.applyUpdate(confirmedData, event);
      this.setConfirmedData(data);
      await this.rebase(optimisticEvents);
      return;
    }

    if (noEvent) {
      await this.rebase(optimisticEvents);
    }
  }

  private async onStreamEvents(events: OptimisticEventWithParams[]) {
    for (const event of events) {
      await this.onStreamEvent(null, event);
    }
  }

  private async onStreamEvent(err: Error | null, event?: OptimisticEventWithParams | ConfirmedEvent) {
    this.logger.trace({ ...this.baseLogContext, action: 'onStreamEvent()', event, err });
    if (err) {
      await this.handleOnStreamMessageError(toError(err));
      return;
    }
    if (!event) {
      return;
    }

    // eagerly apply optimistic updates
    if (!event.confirmed) {
      this.logger.trace('adding optimistic event', { ...this.baseLogContext, action: 'onStreamEvent()', event });
      this.optimisticEvents.push(event as OptimisticEventWithParams);
      await this.computeState(this.confirmedData, this.optimisticData, [], event as OptimisticEventWithParams);
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
        this.logger.trace('removing optimistic event', { ...this.baseLogContext, action: 'onStreamEvent()', event });
        this.optimisticEvents.splice(i, 1);
        await this.computeState(this.confirmedData, this.optimisticData, this.optimisticEvents, event);
        return;
      }
    }

    // If the incoming confirmed event doesn't match any optimistic event, we roll back to the
    // last-confirmed state, apply the incoming event, and rebase the optimistic updates on top.
    await this.computeState(this.confirmedData, this.optimisticData, this.optimisticEvents, event);
  }

  private async rebase(optimisticEvents: OptimisticEvent[]) {
    this.logger.trace({ ...this.baseLogContext, action: 'rebase()', optimisticEvents });
    let base = this.confirmedData;
    for (const event of optimisticEvents) {
      base = await this.applyUpdate(base, event);
    }
    this.setOptimisticData(base);
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
    await this.computeState(this.confirmedData, this.optimisticData, this.optimisticEvents);
    await this.pendingConfirmationRegistry.rejectEvents(err, events);
  }
}
