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
 * Default options applied to all registered mutations.
 */
export const DEFAULT_OPTIONS: MutationOptions = {
  timeout: 1000 * 60 * 2,
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
 * @property onEvents - Invoked with a mutation's expected events and configured options.
 * It should return a tuple of Promise<void>, the first of which resolves when the optimistic
 * updates have been applied and the second of which resolves when the mutation has been confirmed.
 * @property onError - Invoked with an error and the mutation's expected events the mutation,
 * or the onEvents handler, throws.
 */
export type MutationsCallbacks = {
  onEvents: (events: OptimisticEventWithParams[]) => Promise<Promise<void>[]>;
  onError: (err: Error, events: OptimisticEventWithParams[]) => Promise<void>;
};

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
   * @method handleMutation - Returns an async function handles invoking a given mutation.
   * This function will return the awaited result of the mutation method.
   * If the mutation is invoked using $expect, it will first call the onEvents callback
   * with the expected events and any options configured on the mutation. The callback should
   * return a promise that can be used to await confirmation of the event, which is returned
   * along with the mutation result.
   * If the mutation or the onEvents callback throws, it calls the onError callback before re-throwing.
   */
  private handleMutation<K extends keyof M>(
    methodName: K,
    expectedEvents?: Event[],
    comparator?: EventComparator,
  ): any {
    const methodItem = this.methods[methodName] as MutationRegistration;
    const method = isMethodObject(methodItem) ? methodItem.func : methodItem;
    let options = isMethodObject(methodItem) ? { ...DEFAULT_OPTIONS, ...methodItem.options } : DEFAULT_OPTIONS;
    const events: OptimisticEventWithParams[] = expectedEvents
      ? expectedEvents.map((event) => ({
          ...event,
          confirmed: false,
          params: {
            timeout: options.timeout,
            comparator: comparator || defaultComparator,
          },
        }))
      : [];
    const callMethod = async (...args: any[]) => {
      try {
        let result = await method(...args);
        let callbackResult: Awaited<ReturnType<MutationsCallbacks['onEvents']>> = [
          Promise.resolve(),
          Promise.resolve(),
        ];
        if (events && events.length > 0) {
          callbackResult = await this.callbacks.onEvents(events);
        }
        return expectedEvents ? [result, ...callbackResult] : result;
      } catch (err) {
        await this.callbacks.onError(toError(err), events);
        throw err;
      }
    };

    callMethod.$expect =
      (expectedEvents: Event[], comparator?: EventComparator) =>
      (...args: Parameters<M[K]>) =>
        this.handleMutation(methodName, expectedEvents, comparator)(...args);

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
      if (typeof methodItem === 'function') {
        this.methods[methodName as keyof M] = methodItem;
        (this.handler as any)[methodName] = this.handleMutation(methodName as keyof M);
      } else {
        this.methods[methodName as keyof M] = methodItem;
        (this.handler as any)[methodName] = this.handleMutation(methodName as keyof M);
      }
    });
  }
}
