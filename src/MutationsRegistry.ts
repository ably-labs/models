import { toError } from './Errors.js';
import type { Event, OptimisticEvent, OptimisticEventWithParams } from './types/model.js';
import type { EventComparator, OptimisticEventOptions } from './types/optimistic.js';

/**
 * This comparator compares events by their `mutationId` property.
 *
 * @param optimistic - The optimistic event to compare.
 * @param confirmed - The confirmed event to compare.
 * @returns {boolean} Whether the two events are equal.
 */
export const mutationIdComparator: EventComparator = (optimistic: Event, confirmed: Event) => {
  return !!optimistic.mutationId && !!confirmed.mutationId && optimistic.mutationId === confirmed.mutationId;
};

/**
 * Default options applied to all optimistic events.
 */
export const DEFAULT_OPTIONS: OptimisticEventOptions = {
  timeout: 1000 * 60 * 2,
};

/**
 * OptimisticCallbacks facilitates custom handling of expected events submitted to the registry.
 *
 * @property apply - Callback to invoke with the optimistic expected events (and configured options) to
 * optimistically apply the events to the model.
 * It should return a tuple of Promise<void>, the first of which resolves when the optimistic
 * updates have been applied and the second of which resolves when the optimistic event has been confirmed.
 * @property rollback - Callback to invoke with an error and the optimistic events to rollback
 * events that were previously applied.
 */
export type MutationCallbacks = {
  apply: (events: OptimisticEventWithParams[]) => Promise<Promise<void>[]>;
  rollback: (err: Error, events: OptimisticEventWithParams[]) => Promise<void>;
};

/**
 * The MutationsRegistry class encapsulates the processing of optimistic events that can be executed on a given model.
 */
export default class MutationsRegistry {
  constructor(
    readonly callbacks: MutationCallbacks,
    readonly options?: Partial<OptimisticEventOptions>,
  ) {}

  /**
   * Processes optimistic events and waits for them to be applied before returning.
   * If applying the events fails, roll back the changes before surfacing the error to the caller.
   * @param events the expected events to apply optimistically
   * @throws any error encountered applying the optimistic events
   * @returns {{ confirmation: Promise<void> }} the confirmation promise which resolves when the
   * optimistic events are eventually confirmed, or rejects if they are not confirmed (e.g. due to timeout)
   */
  private async processOptimistic(events: OptimisticEventWithParams[]) {
    let optimistic = Promise.resolve();
    let confirmation = Promise.resolve();
    try {
      [optimistic, confirmation] = await this.callbacks.apply(events);
      await optimistic;
      return { confirmation };
    } catch (err) {
      confirmation.catch(() => {}); // the confirmation will reject after the rollback, so ensure we have a handler
      await this.callbacks.rollback(toError(err), events); // rollback the events
      throw toError(err);
    }
  }

  /**
   * Wraps the confirmation promise so that we roll back the optimistic events when the confirmation rejects (e.g. due to timeout).
   * @param confirmation the original confirmation promise
   * @param events the optimistic events associated with the confirmation promise
   * @throws any error returned from the original confirmation promise
   * @returns the result from the original confirmation promise
   */
  private async wrapConfirmation(confirmation: Promise<void>, events: OptimisticEventWithParams[]) {
    try {
      return await confirmation;
    } catch (err) {
      await this.callbacks.rollback(toError(err), events);
      throw err;
    }
  }

  private getOptimisticEventWithParams(
    event: OptimisticEvent,
    options: OptimisticEventOptions,
  ): OptimisticEventWithParams {
    return {
      ...event,
      confirmed: false,
      params: { timeout: options.timeout },
    };
  }

  public async handleOptimistic(
    event: OptimisticEvent,
    options?: Partial<OptimisticEventOptions>,
  ): Promise<[Promise<void>, () => Promise<void>]> {
    const mergedOptions = this.mergeOptions(options, this.options, DEFAULT_OPTIONS);

    const optimisticEvent = this.getOptimisticEventWithParams(event, mergedOptions);
    let confirmation = Promise.resolve();

    ({ confirmation } = await this.processOptimistic([optimisticEvent]));
    confirmation = this.wrapConfirmation(confirmation, [optimisticEvent]);
    confirmation.catch(() => {}); // ensure we always have a handler in case the user discards the promise

    const cancel = () => {
      return this.callbacks.rollback(new Error('optimistic event cancelled'), [optimisticEvent]);
    };

    return [confirmation, cancel];
  }

  private mergeOptions(
    callOptions: Partial<OptimisticEventOptions> | undefined,
    registryOptions: Partial<OptimisticEventOptions> | undefined,
    defaults: OptimisticEventOptions,
  ) {
    let options = Object.assign({}, defaults);
    if (registryOptions) {
      options = Object.assign({}, options, registryOptions);
    }

    if (callOptions) {
      options = Object.assign({}, options, callOptions);
    }

    return options;
  }
}
