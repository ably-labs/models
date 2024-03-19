import type { Event } from './model';

/**
 * EventComparator compares an optimistic event with a confirmed event and returns
 * true if the confirmed event corresponds to the optimistic event (i.e. it confirms it).
 * @param {Event} optimistic - The optimistic event.
 * @param {Event} confirmed - The confirmed event.
 * @returns {boolean} True if the confirmed event corresponds to the optimistic event.
 */
export type EventComparator = (optimistic: Event, confirmed: Event) => boolean;

/**
 * EventOrderer is used to determine the order of elements in the event buffer. It expects
 * to return a negative value of the first argument is less than the second argument, zero
 * if they are equal, and a positive value otherwise.
 * @param {string | number} a - The first event ID.
 * @param {string | number} b - The second event ID.
 * @param {number} - A negative value if a < b, zero if a == b, a positive value otherwise.
 */
export type EventOrderer = (a: string | number, b: string | number) => number;

/**
 * OptimisticEventOptions can be used to configure options on individual optimistic events.
 */
export type OptimisticEventOptions = {
  /**
   * The timeout to receive a confirmation for optimistic events in milliseconds.
   * If the timeout is reached without being confirmed the optimistic events are rolled back.
   * If unset there is a 2 minutes default timeout to avoid leaking unconfirmed events.
   */
  timeout: number;
};

/**
 * SyncOptions can be used to configure options on how model state is synchronised.
 */
export type SyncOptions = {
  /**
   * The limit used when querying for paginated history used to subscribe to changes from the correct
   * point in the channel.
   * @see https://ably.com/docs/storage-history/history?lang=javascript#channel-parameters
   */
  historyPageSize: number;
  /**
   * The message retention period configured on the Ably channel.
   * This is used to determine whether the model state can be brought up to
   * date from message history rather than via a re-sync.
   * @see https://ably.com/docs/storage-history/storage
   */
  messageRetentionPeriod: '2m' | '24h' | '72h';

  /**
   * The retry strategy to use. A function that calculates the next retry duration, returning
   * it in milliseconds. Returning a duration less than 0 will stop the retries.
   * If not set, uses a default backoff retry strategy.
   */
  retryStrategy?: RetryStrategyFunc;
};

/**
 * The retry strategy definition. A function that calculates the next retry duration,
 * returning it in milliseconds. Returning a duration less than 0 will stop the retries.
 * @param {number} attempt - the attempt number, provided automatically by the SDK when
 * using this strategy function.
 * @returns {number} - the number of milliseconds to wait before retrying, return a number
 * les than zero to stop retrying.
 */
export type RetryStrategyFunc = (attempt: number) => number;

/**
 * OptimisticInvocationParams are parameters passed when submitting a set of optimistic events.
 */
export type OptimisticInvocationParams = {
  /**
   * A set of optimistic events to be applied and which are
   * expected to be confirmed by the backend.
   */
  events: Event[];
  /**
   * Options that can be used to override any configured options for a specific invocation.
   */
  options?: Partial<OptimisticEventOptions>;
};

/**
 * Promise that resolves to a [confirmed, cancel] tuple.
 * @interface
 */
export type OptimisticEventConfirmation = Promise<[Promise<void>, () => Promise<void>]>;

/**
 * The header name of the models event UUID.
 */
export const MODELS_EVENT_UUID_HEADER = 'x-ably-models-event-uuid';
/**
 * The header name of the models event rejection field.
 */
export const MODELS_EVENT_REJECT_HEADER = 'x-ably-models-reject';
