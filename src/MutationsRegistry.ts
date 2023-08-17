import isEqual from 'lodash/isEqual.js';

import { toError } from './Errors.js';
import type { Event, OptimisticEventWithParams } from './types/model.js';
import type {
  MutationFunc,
  EventComparator,
  MutationOptions,
  MutationRegistration,
  MutationMethods,
  MethodWithExpect,
} from './types/mutations.js';

/**
 * The default event comparator used by all registered mutation functions, unless an override option is provided.
 *
 * @param optimistic - The optimistic event to compare.
 * @param confirmed - The confirmed event to compare.
 * @returns {boolean} Whether the two events are equal by channel, event name and deep equality on the event data.
 */
export const defaultComparator: EventComparator = (optimistic: Event, confirmed: Event) => {
  return (
    optimistic.channel === confirmed.channel &&
    optimistic.name === confirmed.name &&
    isEqual(optimistic.data, confirmed.data)
  );
};

/**
 * Default options applied to all registered mutations.
 */
export const DEFAULT_OPTIONS: Required<MutationOptions> = {
  timeout: 1000 * 60 * 2,
  comparator: defaultComparator,
};

/**
 * @internal
 * @template T - A mutation function
 * @param {MutationRegistration<T>} method - A method registration
 * @returns {boolean} - Whether the given mutation registration is a function object with 'func' and 'options' properties.
 */
function isMethodObject<T extends MutationFunc>(
  method: MutationRegistration<T>,
): method is { func: T; options: MutationOptions } {
  return (method as { func: T; options: MutationOptions }).func !== undefined;
}

/**
 * MutationsCallbacks facilitates custom handling of expected events emitted by mutations.
 *
 * @property apply - Callback to invoke with a mutation's expected events (and configured options) to
 * optimistically apply the events to the model.
 * It should return a tuple of Promise<void>, the first of which resolves when the optimistic
 * updates have been applied and the second of which resolves when the mutation has been confirmed.
 * @property rollback - Callback to invoke with an error and the mutation's expected events to rollback
 * events that were previously applied.
 */
export type MutationsCallbacks = {
  apply: (events: OptimisticEventWithParams[]) => Promise<Promise<void>[]>;
  rollback: (err: Error, events: OptimisticEventWithParams[]) => Promise<void>;
};

/**
 * The MutationsRegistry class encapsulates the mutations that can be executed on a given model.
 * It allows you to register mutation methods, handle expected events during a mutation, and handle errors
 * that might occur during a mutation.
 *
 * @template M - The type of the mutation methods. This should be a map from method names to mutations.
 */
export default class MutationsRegistry<M extends MutationMethods> {
  private methods: Partial<{ [K in keyof M]: MutationRegistration<M[K]> }> = {};

  constructor(readonly callbacks: MutationsCallbacks) {}

  /**
   * Processes optimistic events and waits for them to be applied before returning.
   * If applying the events fails, roll back the changes before surfacing the error to the caller.
   * @param events the optimistic events to apply
   * @throws any error encountered applying the optimistic events
   * @returns {{ confirmation: Promise<void> }} the confirmation promise which resolves when the optimistic events are eventually confirmed, or rejects if they are not confirmed (e.g. due to timeout)
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

  /**
   * @method handleMutation - Returns an async function that handles invoking a given mutation.
   * This function will return the awaited result of the mutation method.
   * If the mutation is invoked using $expect, it will first call the apply callback
   * with the expected events and any options configured on the mutation.
   * If the mutation or the apply callback throws, it calls the rollback callback before re-throwing.
   * @returns The mutation result. If invoked with $expect, returns the mutation result and the confirmation promise.
   */
  private handleMutation<K extends keyof M>(methodName: K, expectedEvents?: Event[]): any {
    const methodItem = this.methods[methodName] as MutationRegistration;
    const method = isMethodObject(methodItem) ? methodItem.func : methodItem;
    let options = isMethodObject(methodItem) ? { ...DEFAULT_OPTIONS, ...methodItem.options } : DEFAULT_OPTIONS;
    const events: OptimisticEventWithParams[] = expectedEvents
      ? expectedEvents.map((event) => ({
          ...event,
          confirmed: false,
          params: {
            timeout: options.timeout,
            comparator: options.comparator,
          },
        }))
      : [];

    const callMethod = async (...args: any[]) => {
      let confirmation = Promise.resolve();
      if (events && events.length > 0) {
        ({ confirmation } = await this.processOptimistic(events));
      }
      try {
        let result = await method(...args);
        return expectedEvents ? [result, this.wrapConfirmation(confirmation, events)] : result;
      } catch (mutationErr) {
        confirmation.catch(() => {}); // the confirmation will reject after the rollback, so ensure we have a handler
        await this.callbacks.rollback(toError(mutationErr), events);
        throw toError(mutationErr);
      }
    };

    callMethod.$expect =
      (expectedEvents: Event[]) =>
      (...args: Parameters<M[K]>) =>
        this.handleMutation(methodName, expectedEvents)(...args);

    return callMethod;
  }

  /**
   * @property handler - Externally exposed map of mutation methods, which are augmented with an additional
   * $expect method that can be used to register expected events.
   */
  handler = {} as MethodWithExpect<M>;

  /**
   * @method register - Takes an object that maps method names to registrations,
   * and sets up mutation handlers for these methods.
   */
  register(mutations: { [K in keyof M]: MutationRegistration<M[K]> }) {
    Object.keys(mutations).forEach((methodName: string) => {
      if ((this.handler as any)[methodName]) {
        throw new Error(`mutation with name '${methodName}' already registered`);
      }
      const methodItem = mutations[methodName as keyof M];
      this.methods[methodName as keyof M] = methodItem;
      (this.handler as any)[methodName] = this.handleMutation(methodName as keyof M);
    });
  }
}
