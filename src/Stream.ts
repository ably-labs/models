import { Types as AblyTypes } from 'ably';
import { Logger } from 'pino';
import { Subject, Subscription } from 'rxjs';

import type { StandardCallback } from './types/callbacks';
import EventEmitter from './utilities/EventEmitter.js';

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
}

/**
 * Options used to configure a stream instance.
 */
export type StreamOptions = {
  channel: string;
  ably: AblyTypes.RealtimePromise;
  logger: Logger;
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
  get channel(): string;
  pause(): Promise<void>;
  resume(): Promise<void>;
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
  private readonly ablyChannel: AblyTypes.RealtimeChannelPromise;
  private readonly subscriptions = new Subject<AblyTypes.Message>();
  private subscriptionMap: WeakMap<StandardCallback<AblyTypes.Message>, Subscription> = new WeakMap();

  private readonly baseLogContext: Partial<{ scope: string; action: string }>;
  private readonly logger: Logger;

  constructor(readonly options: StreamOptions) {
    super();
    this.ably = options.ably;
    this.logger = options.logger;
    this.ablyChannel = this.ably.channels.get(this.options.channel);
    this.ablyChannel.on('failed', (change) => this.dispose(change.reason));
    this.ablyChannel.on(['suspended', 'update'], () =>
      this.subscriptions.error(new Error('discontinuity in channel connection')),
    );
    this.baseLogContext = { scope: `Stream#${options.channel}` };
    this.init();
  }

  public get state() {
    return this.currentState;
  }

  public get channel() {
    return this.options.channel;
  }

  public async pause() {
    this.setState(StreamState.PAUSED);
    await this.ablyChannel.detach();
  }

  public async resume() {
    await this.ably.connection.whenState('connected');
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
        this.logger.trace({ ...this.baseLogContext, action: 'error()' });
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
    this.subscriptions.unsubscribe();
    this.subscriptionMap = new WeakMap();
    await this.ablyChannel.detach();
    this.ably.channels.release(this.ablyChannel.name);
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

  private async init() {
    this.logger.trace({ ...this.baseLogContext, action: 'init()' });
    this.setState(StreamState.PREPARING);
    await this.ably.connection.whenState('connected');
    await this.ablyChannel.subscribe(this.onMessage.bind(this));
    this.setState(StreamState.READY);
  }

  private onMessage(message: AblyTypes.Message) {
    this.logger.trace({ ...this.baseLogContext, action: 'onMessage()', message });
    this.subscriptions.next(message);
  }
}
