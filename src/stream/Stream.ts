import { Types as AblyTypes } from 'ably';
import { Logger } from 'pino';
import { Subject, Subscription } from 'rxjs';

import { OrderedHistoryResumer } from './Middleware.js';
import type { StandardCallback } from '../types/callbacks';
import type { EventOrderer } from '../types/optimistic.js';
import EventEmitter from '../utilities/EventEmitter.js';

export const HISTORY_PAGE_SIZE = 100;

/**
 * StreamState represents the possible lifecycle states of a stream.
 */
export enum StreamState {
  /**
   * The stream has been initialized but no attach has yet been attempted.
   */
  INITIALIZED = 'initialized',
  /**
   * The stream is attempting to establish a realtime connection and attach to the channel.
   * The preparing state is entered as soon as the library has completed initialization,
   * and is reentered each time connection is re-attempted following detachment or disconnection.
   */
  PREPARING = 'preparing',
  /**
   * The stream has a realtime connection, is attached to the channel and is delivering messages.
   */
  READY = 'ready',
  /**
   * The user has paused the stream.
   */
  PAUSED = 'paused',
  /**
   * The stream has been disposed, either by the user disposing it or an unrecoverable error,
   * and its resources are available for garbage collection.
   */
  DISPOSED = 'disposed',
  /**
   * The stream has encountered an unrecoverable error and must be explicitly re-synced.
   */
  ERRORED = 'errored',
}

/**
 * Options used to configure a stream instance.
 */
export type StreamOptions = {
  channelName: string;
  ably: AblyTypes.RealtimePromise;
  logger: Logger;
  eventBufferOptions?: EventBufferOptions;
};

export type EventBufferOptions = {
  /**
   * bufferms is the period of time events are held in a buffer
   * for reordering and deduplicating. By default this is zero,
   * which disables the buffer. Setting bufferMs to a non-zero
   * value enables the buffer. The buffer is a sliding window.
   */
  bufferMs?: number;
  /**
   * eventOrderer defines the correct order of events. By default,
   * when the buffer is enabled the event order is the lexicographical
   * order of the message ids within the buffer.
   */
  eventOrderer?: EventOrderer;
};

/**
 * A state transition emitted as an event from the stream describing a change to the stream's lifecycle.
 */
export type StreamStateChange = {
  current: StreamState;
  previous: StreamState;
  reason?: AblyTypes.ErrorInfo | string;
};

export interface IStream {
  get state(): StreamState;
  get channelName(): string;
  pause(): Promise<void>;
  resume(): Promise<void>;
  sync(sequenceID: string): Promise<void>;
  subscribe(callback: StandardCallback<AblyTypes.Message>): void;
  unsubscribe(callback: StandardCallback<AblyTypes.Message>): void;
  dispose(reason?: AblyTypes.ErrorInfo | string): Promise<void>;
}

/**
 * A Stream is an abstraction over an Ably channel which handles the channel lifecycle.
 */
export default class Stream extends EventEmitter<Record<StreamState, StreamStateChange>> implements IStream {
  private readonly ably: AblyTypes.RealtimePromise;
  private currentState: StreamState = StreamState.INITIALIZED;
  private subscriptions = new Subject<AblyTypes.Message>();
  private subscriptionMap: WeakMap<StandardCallback<AblyTypes.Message>, Subscription> = new WeakMap();
  private ablyChannel?: AblyTypes.RealtimeChannelPromise;
  private middleware?: OrderedHistoryResumer;

  private readonly baseLogContext: Partial<{ scope: string; action: string }>;
  private readonly logger: Logger;

  constructor(readonly options: StreamOptions) {
    super();
    this.ably = options.ably;
    this.logger = options.logger;
    this.baseLogContext = { scope: `Stream#${options.channelName}` };
  }

  public get state() {
    return this.currentState;
  }

  public get channelName() {
    return this.options.channelName;
  }

  public async pause() {
    this.setState(StreamState.PAUSED);
    if (this.ablyChannel) {
      await this.ablyChannel.detach();
    }
  }

  public async resume() {
    await this.ably.connection.whenState('connected');
    if (!this.ablyChannel) {
      throw new Error('no ably channel configured on the stream');
    }
    await this.ablyChannel.attach();
    this.setState(StreamState.READY);
  }

  public subscribe(callback: StandardCallback<AblyTypes.Message>) {
    this.logger.trace({ ...this.baseLogContext, action: 'subscribe()' });
    const subscription = this.subscriptions.subscribe({
      next: (message) => {
        this.logger.trace({ ...this.baseLogContext, action: 'next()' });
        callback(null, message);
      },
      error: (err) => {
        this.logger.trace({ ...this.baseLogContext, action: 'error()', error: err.toString() });
        callback(err);
      },
      complete: () => {
        this.logger.trace({ ...this.baseLogContext, action: 'complete()' });
        this.unsubscribe(callback);
      },
    });
    this.subscriptionMap.set(callback, subscription);
  }

  public unsubscribe(callback: StandardCallback<AblyTypes.Message>) {
    this.logger.trace({ ...this.baseLogContext, action: 'unsubscribe()' });
    const subscription = this.subscriptionMap.get(callback);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptionMap.delete(callback);
    }
  }

  public async dispose(reason?: AblyTypes.ErrorInfo | string) {
    this.logger.trace({ ...this.baseLogContext, action: 'dispose()', reason });
    this.setState(StreamState.DISPOSED, reason);
    await this.reset();
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subject<AblyTypes.Message>();
    this.subscriptionMap = new WeakMap();
  }

  public async sync(sequenceID: string) {
    this.logger.trace({ ...this.baseLogContext, action: 'sync()' });
    this.setState(StreamState.PREPARING);
    try {
      await this.reset();
      await this.init(sequenceID);
      this.setState(StreamState.READY);
    } catch (err) {
      this.logger.error('sync failed', { err });
      this.setState(StreamState.ERRORED);
      throw err; // surface the error to the caller
    }
  }

  private setState(state: StreamState, reason?: AblyTypes.ErrorInfo | string) {
    this.logger.trace({ ...this.baseLogContext, action: 'setState()', state, reason });
    const previous = this.currentState;
    this.currentState = state;
    this.emit(state, {
      current: this.currentState,
      previous,
      reason,
    } as StreamStateChange);
  }

  private async reset() {
    if (this.middleware) {
      this.middleware.unsubscribeAll();
    }
    if (this.ablyChannel) {
      await this.ablyChannel.detach();
      this.ably.channels.release(this.ablyChannel.name);
    }
  }

  private async init(sequenceID: string) {
    this.logger.trace({ ...this.baseLogContext, action: 'init()' });

    this.middleware = new OrderedHistoryResumer(
      sequenceID,
      this.options.eventBufferOptions?.bufferMs || 0,
      this.options.eventBufferOptions?.eventOrderer,
    );
    this.middleware.subscribe(this.onMiddlewareMessage.bind(this));

    this.ablyChannel = this.ably.channels.get(this.options.channelName);
    this.ablyChannel.on('failed', (change) => this.dispose(change.reason));
    this.ablyChannel.on(['suspended', 'update'], () => {
      this.subscriptions.error(new Error('discontinuity in channel connection'));
    });
    await this.ably.connection.whenState('connected');

    const attachResult = await this.ablyChannel.attach();
    if (!attachResult) {
      throw new Error('the channel was already attached when calling attach()');
    }
    const subscribeResult = await this.ablyChannel.subscribe(this.onChannelMessage.bind(this));
    if (subscribeResult) {
      throw new Error('the channel was not attached when calling subscribe()');
    }

    let page = await this.ablyChannel.history({ untilAttach: true, limit: HISTORY_PAGE_SIZE });
    if (page.items.length === 0) {
      // If there is no history at all, we cannot resume from the sequenceID.
      // Since we require that the state is no more than 2 mins stale (or 72 hours if persisted history is enabled)
      // we assume that no updates have been made to the state in that time, and allow operation to continue as
      // though we were able to resume correctly.
      this.middleware.flush();
    } else {
      // We have at least one page of history, so we continue to paginate back until we reach the
      // sequenceID or we run out of messages.
      let done = this.middleware.addHistoricalMessages(page.items);
      while (!done && page && page.hasNext()) {
        page = await this.ablyChannel.history({ untilAttach: true, limit: HISTORY_PAGE_SIZE });
        done = this.middleware.addHistoricalMessages(page.items);
      }
    }
    // If the middleware is not ready it means we never reached the target sequenceID,
    // so the target sequenceID was too stale and we should surface an error.
    if (this.middleware.state !== 'ready') {
      throw new Error(`insufficient history to seek to sequenceID ${sequenceID} in stream`);
    }
  }

  private onChannelMessage(message: AblyTypes.Message) {
    this.logger.trace({ ...this.baseLogContext, action: 'onMessage()', message });
    if (!this.middleware) {
      throw new Error('received channel message before middleware was registered');
    }
    this.middleware.addLiveMessages(message);
  }

  private onMiddlewareMessage(err: Error | null, message: AblyTypes.Message | null) {
    if (err) {
      this.logger.error({ ...this.baseLogContext, action: 'onMiddlewareMessage()', message, err });
      this.subscriptions.error(err);
      return;
    }
    this.logger.trace({ ...this.baseLogContext, action: 'onMiddlewareMessage()', message });
    this.subscriptions.next(message!);
  }
}
