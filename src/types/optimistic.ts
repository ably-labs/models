import { Types as AblyTypes } from 'ably';

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
export type EventOrderer = (a: AblyTypes.Message, b: AblyTypes.Message) => number;

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