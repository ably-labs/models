import type { Event } from './model';

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

/**
 * MutationRegistration represents either a MutationFunc itself or an object containing a MutationFunc and its options.
 * It's used when registering a mutation method on a model.
 * @template T - A MutationFunc
 */
export type MutationRegistration<T extends MutationFunc = MutationFunc> =
  | T
  | {
      func: T;
      options: MutationOptions;
    };

/**
 * MutationMethods is a mapping of method names to mutation functions. Users must provide a type which extends this
 * when specifying the mutations on a model via the second type parameter `M` on the `Model<T, M>`.
 */
export type MutationMethods = { [K: string]: MutationFunc<any[], any> };

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
export type MethodWithExpect<M extends MutationMethods> = {
  [K in keyof M]: M[K] & {
    $expect: (
      expectedEvents: Event[],
      comparator?: EventComparator,
    ) => (...args: Parameters<M[K]>) => Awaited<[ReturnType<M[K]>, Promise<void>, Promise<void>]>;
  };
};
