import type { Types } from 'ably';
import type { Logger } from 'pino';

import type { EventOrderer, SyncOptions } from '../types/optimistic.js';

/**
 * Options used to configure a stream instance.
 */
export type StreamOptions = {
  channelName: string;
  ably: Types.RealtimePromise;
  logger: Logger;
  syncOptions: SyncOptions;
  eventBufferOptions: EventBufferOptions;
};

/**
 * Options used to configure the in-memory sliding-window buffer used for for reordering and deduplicating.
 */
export type EventBufferOptions = {
  /**
   * The period of time events are held in a buffer.
   * By default this is zero, which disables the buffer.
   * Setting it to a non-zero value enables the buffer.
   */
  bufferMs: number;
  /**
   * Defines the correct order of events.
   * When the buffer is enabled the default event order is the
   * lexicographical order of the message ids within the buffer.
   */
  eventOrderer: EventOrderer;

  /**
   * The time to wait for the last message to be received on the channel.
   * Used to calculate if the state that's returned from the sync function
   * is recent enough to be matched against the avaialble channel messages.
   * Defaults to 3 seconds.
   */
  persistLastWaitTime?: number;
};

/**
 * A state transition emitted as an event from the stream describing a change to the stream's lifecycle.
 */
export type StreamStateChange = {
  current: StreamState;
  previous: StreamState;
  reason?: Types.ErrorInfo | string;
};

/**
 * StreamState represents the possible lifecycle states of a stream.
 */
export type StreamState =
  /**
   * The stream has been initialized but no attach has yet been attempted.
   */
  | 'initialized'
  /**
   * The stream is establishing a realtime connection, attaching to a channel and
   * seeking through message history to replay messages from the correct point in the stream.
   */
  | 'seeking'
  /**
   * The stream is delivering messages in realtime.
   */
  | 'ready'
  /**
   * The stream has been reset and is not attached to the channel or delivering messages.
   */
  | 'reset'
  /**
   * The stream has been disposed, either by the user disposing it or an unrecoverable error,
   * and its resources are available for garbage collection.
   */
  | 'disposed'
  /**
   * The stream has encountered an unrecoverable error and must be explicitly re-synced.
   */
  | 'errored';
