import { Types as AblyTypes } from 'ably';
import { Logger } from 'pino';
import { Subject, Subscription } from 'rxjs';

import { OrderedHistoryResumer } from './Middleware.js';
import { StreamDiscontinuityError } from '../Errors.js';
import type { StandardCallback } from '../types/callbacks';
import type { StreamStateChange, StreamOptions, StreamState } from '../types/stream.js';
import EventEmitter from '../utilities/EventEmitter.js';
import { VERSION } from '../version.js';

export interface IStream {
  get state(): StreamState;
  get channelName(): string;

  reset(): Promise<void>;
  replay(sequenceId: string): Promise<void>;
  subscribe(callback: StandardCallback<AblyTypes.Message>): void;
  unsubscribe(callback: StandardCallback<AblyTypes.Message>): void;
  dispose(reason?: AblyTypes.ErrorInfo | string): Promise<void>;
}

/**
 * A Stream is an abstraction over an Ably channel which handles the channel lifecycle.
 */
export default class Stream extends EventEmitter<Record<StreamState, StreamStateChange>> implements IStream {
  private readonly ably: AblyTypes.RealtimePromise;
  private currentState: StreamState = 'initialized';
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

  public async reset() {
    if (this.currentState === 'reset') {
      return;
    }
    this.logger.trace({ ...this.baseLogContext, action: 'reset()' });
    this.setState('reset');
    if (this.middleware) {
      this.middleware.unsubscribeAll();
    }
    if (this.ablyChannel) {
      await this.ablyChannel.detach();
      this.ably.channels.release(this.ablyChannel.name);
    }
  }

  public async dispose(reason?: AblyTypes.ErrorInfo | string) {
    if (this.currentState === 'disposed') {
      return;
    }
    this.logger.trace({ ...this.baseLogContext, action: 'dispose()', reason });
    if (this.currentState !== 'reset') {
      await this.reset();
    }
    this.setState('disposed', reason);
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subject<AblyTypes.Message>();
    this.subscriptionMap = new WeakMap();
  }

  public async replay(sequenceId: string) {
    this.logger.trace({ ...this.baseLogContext, action: 'replay()', sequenceId });
    try {
      if (this.currentState !== 'reset') {
        await this.reset();
      }
      await this.seek(sequenceId);
      this.setState('ready');
    } catch (err) {
      this.logger.error('sync failed', { ...this.baseLogContext, action: 'replay()', err });
      this.setState('errored');
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

  /**
   * Resubscribe to the channel and emit messages from the position in the stream specified by the sequenceId.
   * This is achieved by attaching to the channel and paginating back through history until the boundary determined by
   * the specified sequenceId is reached.
   * @param sequenceId The identifier that specifies the position in the message stream (by message ID) from which to resume.
   */
  private async seek(sequenceId: string) {
    this.logger.trace({ ...this.baseLogContext, action: 'seek()', sequenceId });
    this.setState('seeking');

    this.middleware = new OrderedHistoryResumer(
      sequenceId,
      this.options.eventBufferOptions.bufferMs,
      this.options.eventBufferOptions.eventOrderer,
    );
    this.middleware.subscribe(this.onMiddlewareMessage.bind(this));

    this.ablyChannel = this.ably.channels.get(this.options.channelName);

    if (this.ablyChannel.state !== 'attached' && this.ablyChannel.state !== 'attaching') {
      this.ablyChannel.setOptions({ params: { agent: `models/${VERSION}` } });
    }
    this.ablyChannel.on('failed', (change) => {
      this.dispose(change.reason);
      this.subscriptions.error(new Error('Stream failed: ' + change.reason));
    });
    this.ablyChannel.on(['suspended', 'update'], (change) => {
      if (!change.resumed) {
        this.subscriptions.error(new StreamDiscontinuityError('discontinuity in channel connection'));
      }
    });
    await this.ably.connection.whenState('connected');

    const subscribeResult = await this.ablyChannel.subscribe(this.onChannelMessage.bind(this)); // live messages
    if (!subscribeResult) {
      throw new Error('the channel was already attached when calling subscribe()');
    }

    // Paginate back until we reach the sequenceId or we run out of messages.
    //
    // Note that the state returned by the sync function may be loaded from a cache.
    // When the cached state is older than the message retention period configured on the channel (i.e. 2mins/24hours/72hours), we have two situations:
    // - The state *has not* changed at all since the cache was populated
    // - The state *has* changed since the cache was populated
    // In both cases, the message history will be empty. We cannot distinguish between these two cases.
    // So the onus is on the user to return state that isn't too stale relative to subsequent changes to that state when bootstrapping.
    let done = false;
    let page: AblyTypes.PaginatedResult<AblyTypes.Message>;
    let limit = this.options.syncOptions.historyPageSize;
    let n = 0;
    do {
      page = await this.ablyChannel.history({ untilAttach: true, limit });
      done = this.middleware.addHistoricalMessages(page.items);
      this.logger.trace('fetched history page', {
        ...this.baseLogContext,
        action: 'seek()',
        sequenceId,
        limit,
        n,
        count: page?.items?.length,
        hasNext: page?.hasNext(),
      });
      n++;
    } while (page && page.items && page.items.length > 0 && page.hasNext() && !done);

    // If the middleware is not in the success state it means there were some history messages and we never reached the target sequenceId.
    // This means the target sequenceId was too old and a re-sync from a newer state snapshot is required.
    if (this.middleware.state !== 'success') {
      throw new Error(`insufficient history to seek to sequenceId ${sequenceId} in stream`);
    }
  }

  private onChannelMessage(message: AblyTypes.Message) {
    this.logger.trace({ ...this.baseLogContext, action: 'onChannelMessage()', message });
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
