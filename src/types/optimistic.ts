import type { Event } from './model';

/**
 * EventComparator compares an optimistic event with a confirmed event and returns
 * true if the confirmed event corresponds to the optimistic event (i.e. it confirms it).
 */
export type EventComparator = (optimistic: Event, confirmed: Event) => boolean;

/**
 * EventOrderer is used to determine the order of elements in the event buffer. It expects
 * to return a negative value of the first argument is less than the second argument, zero
 * if they are equal, and a positive value otherwise.
 */
export type EventOrderer = (a: string, b: string) => number;

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
   * The retry strategy to use. An array of durations in milliseconds to wait between each retry.
   * Passing an array of [2000, 4000, 8000] would configure the sync funciton to retry 3 times,
   * waiting 2seconds, then 4seconds, then 8seconds. The sync function will be retried if it
   * throws an error, and if the retries are exhausted the most recent error will be thrown.
   * Defaults to [2000, 4000, 8000]
   */
  retryStrategy?: number[];
};

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

export const MODELS_EVENT_UUID_HEADER = 'x-ably-models-event-uuid';
export const MODELS_EVENT_REJECT_HEADER = 'x-ably-models-reject';
