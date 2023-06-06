import { Types } from 'ably';
import EventEmitter from './utilities/EventEmitter';
import { ListenerPair, SubscriptionEvent } from './utilities/Subscriptions';
import { StandardCallback } from './types/callbacks';

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
  private subscriptions = new EventEmitter<SubscriptionEvent<Types.Message>>();
  private subscriptionMap: Map<StandardCallback<Types.Message>, ListenerPair<Types.Message>> = new Map();

  constructor(readonly name: string, readonly ably: Types.RealtimePromise, options: StreamOptions) {
    super();
    this.options = { ...STREAM_OPTIONS_DEFAULTS, ...options };
    this.ablyChannel = this.ably.channels.get(this.options.channel);
    this.ablyChannel.on('failed', (change) => this.dispose(change.reason));
    this.init();
  }

  get state() {
    return this.currentState;
  }

  get channel() {
    return this.options.channel;
  }

  setState(state: StreamState, reason?: Types.ErrorInfo | string) {
    const previous = this.currentState;
    this.currentState = state;
    this.emit(state, {
      current: this.currentState,
      previous,
      reason,
    } as StreamStateChange);
  }

  async init() {
    this.setState(StreamState.PREPARING);
    await this.ably.connection.whenState('connected');
    await this.ablyChannel.subscribe(this.onMessage.bind(this));
    this.setState(StreamState.READY);
  }

  async pause() {
    this.setState(StreamState.PAUSED);
    await this.ablyChannel.detach();
  }

  async resume() {
    await this.ably.connection.whenState('connected');
    await this.ablyChannel.attach();
    this.setState(StreamState.READY);
  }

  subscribe(callback: StandardCallback<Types.Message>) {
    if (this.currentState !== StreamState.READY) {
      callback(new Error(`stream is not in ready state (state = ${this.currentState})`));
      return;
    }
    const listenerPair: ListenerPair<Types.Message> = {
      message: (message) => callback(null, message),
      error: callback,
    };
    this.subscriptions.on('message', listenerPair.message);
    this.subscriptions.on('error', listenerPair.error);
    this.subscriptionMap.set(callback, listenerPair);
  }

  unsubscribe(callback: StandardCallback<Types.Message>) {
    const listeners = this.subscriptionMap.get(callback);
    if (listeners) {
      this.subscriptions.off('message', listeners.message);
      this.subscriptions.off('error', listeners.error);
      this.subscriptionMap.delete(callback);
    }
  }

  dispose(reason?: Types.ErrorInfo | string) {
    this.setState(StreamState.DISPOSED, reason);
    this.subscriptions.off('message');
    this.subscriptions.off('error');
    this.ably.channels.release(this.ablyChannel.name);
  }

  onMessage(message: Types.Message) {
    this.subscriptions.emit('message', message);
  }
}

export default Stream;
