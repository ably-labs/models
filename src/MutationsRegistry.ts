import isEqual from 'lodash/isEqual.js';
import { Event, OptimisticEventWithParams } from './Model.js';
import { toError } from './utilities/Errors.js';

/**
 * A MutationFunc is a function that mutates the actual data, typically via an API request to the backend.
 * @template T - An array of input argument types
 * @template R - The return type of the mutation
 */
export type MutationFunc<T extends any[] = any[], R = any> = (...args: T) => Promise<R>;

/**
 * EventComparator compares an optimistic event with a confirmed event and returns
 * true if the confirmed event corresponds to the optimistic event (i.e. it confirms it).
 */
export type EventComparator = (optimistic: Event, confirmed: Event) => boolean;

/**
 * MutationOptions can be used to configure options on individual mutations.
 * @property timeout - The timeout to receive a confirmation for optimistic mutation events in milliseconds.
 * If the timeout is reached without being confirmed the optimistic events are rolled back.
 * If unset there is a 2 minutes default timeout to avoid leaking unconfirmed events.
 */
export type MutationOptions = {
  timeout: number;
};

export const DEFAULT_OPTIONS: MutationOptions = {
  timeout: 1000 * 60 * 2,
};

/**
 * MutationRegistration represents either a MutationFunc itself or an object containing a MutationFunc and its options.
 * It's used when registering a mutation method on a model via Models#$register.
 * @template T - A MutationFunc
 */
export type MutationRegistration<T extends MutationFunc = MutationFunc> =
  | T
  | {
      func: T;
      options: MutationOptions;
    };

/**
 * MutationMethods is a mapping of method names to MutationFunc. Users must provide a type which extends this
 * when specifying the mutations on a model via the second type parameter M on the Model<T, M>.
 */
export type MutationMethods = { [K: string]: MutationFunc<any[], any> };

/**
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
 * Type `MethodWithExpect` represents the mutation methods along with a special `$expect` method.
 * For each method in M, it defines a corresponding method in `MethodWithExpect<M>`. In addition,
 * it also defines a special `$expect` method, which when invoked with a list of expected events,
 * returns a function that takes the same parameters as the original method and returns a Promise that
 * resolves to a tuple. The first element of the tuple is the result of invoking the original method;
 * the second element is a Promise<void> which gets resolved when the updates have been optimistically
 * applied; and the third element is a Promise<void> which gets resolved when the mutation is confirmed.
 *
 * @template M The mutation methods type.
 */
type MethodWithExpect<M extends MutationMethods> = {
  [K in keyof M]: M[K] & {
    $expect: (
      expectedEvents: Event[],
      comparator?: EventComparator,
    ) => (...args: Parameters<M[K]>) => Awaited<[ReturnType<M[K]>, Promise<void>, Promise<void>]>;
  };
};

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
 * @template M - The type of the mutation methods. This should be a map from method names to MutationFunc.
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
          callbackResult = await this.callbacks.onEvents(events); // TODO this doesn't need awaiting, but tests fail if not awaited
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
