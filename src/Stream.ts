import { Subject, Subscription } from 'rxjs';
import { Types } from 'ably';
import EventEmitter from './utilities/EventEmitter.js';
import type { StandardCallback } from './types/callbacks';

const STREAM_OPTIONS_DEFAULTS = {};

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

export type StreamOptions = {
  channel: string;
  filter?: string;
};

export type StreamStateChange = {
  current: StreamState;
  previous: StreamState;
  reason?: Types.ErrorInfo | string;
};

class Stream extends EventEmitter<Record<StreamState, StreamStateChange>> {
  private options: StreamOptions;
  private currentState: StreamState = StreamState.INITIALIZED;
  private ablyChannel: Types.RealtimeChannelPromise;
  private subscriptions = new Subject<Types.Message>();
  private subscriptionMap: Map<StandardCallback<Types.Message>, Subscription> = new Map();

  constructor(readonly name: string, readonly ably: Types.RealtimePromise, options: StreamOptions) {
    super();
    this.options = { ...STREAM_OPTIONS_DEFAULTS, ...options };
    if (this.options.filter) {
      this.ablyChannel = this.ably.channels.getDerived(this.options.channel, { filter: this.options.filter });
    } else {
      this.ablyChannel = this.ably.channels.get(this.options.channel);
    }
    this.ablyChannel.on('failed', (change) => this.dispose(change.reason));
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

  public subscribe(callback: StandardCallback<Types.Message>) {
    if (this.currentState !== StreamState.READY) {
      callback(new Error(`stream is not in ready state (state = ${this.currentState})`));
      return;
    }
    const subscription = this.subscriptions.subscribe({
      next: (message) => callback(null, message),
      error: (err) => callback(err),
      complete: () => this.unsubscribe(callback),
    });
    this.subscriptionMap.set(callback, subscription);
  }

  public unsubscribe(callback: StandardCallback<Types.Message>) {
    const subscription = this.subscriptionMap.get(callback);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptionMap.delete(callback);
    }
  }

  public dispose(reason?: Types.ErrorInfo | string) {
    this.setState(StreamState.DISPOSED, reason);
    this.subscriptions.unsubscribe();
    this.subscriptionMap.clear();
    this.ably.channels.release(this.ablyChannel.name);
  }

  private setState(state: StreamState, reason?: Types.ErrorInfo | string) {
    const previous = this.currentState;
    this.currentState = state;
    this.emit(state, {
      current: this.currentState,
      previous,
      reason,
    } as StreamStateChange);
  }

  private async init() {
    this.setState(StreamState.PREPARING);
    await this.ably.connection.whenState('connected');
    await this.ablyChannel.subscribe(this.onMessage.bind(this));
    this.setState(StreamState.READY);
  }

  private onMessage(message: Types.Message) {
    this.subscriptions.next(message);
  }
}

export default Stream;
