import type { Event } from './model';

/**
 * EventComparator compares an optimistic event with a confirmed event and returns
 * true if the confirmed event corresponds to the optimistic event (i.e. it confirms it).
 */
export type EventComparator = (optimistic: Event, confirmed: Event) => boolean;

/**
 * MutationOptions can be used to configure options on individual mutations.
 */
export type MutationOptions = {
  /**
   * The timeout to receive a confirmation for optimistic mutation events in milliseconds.
   * If the timeout is reached without being confirmed the optimistic events are rolled back.
   * If unset there is a 2 minutes default timeout to avoid leaking unconfirmed events.
   */
  timeout?: number;
  /**
   * The event comparator used to correlate optimistic events with confirmed events.
   */
  comparator?: EventComparator;
};

/**
 * A MutationFunc is a function that mutates the actual data, typically via an API request to the backend.
 *
 * @template A - An array of input argument types
 * @template R - The return type of the mutation.
 */
export type MutationFunc<A extends any[] = any[], R = any> = (...args: A) => Promise<R>;

/**
 * MutationMethods is a mapping of method names to mutation functions. Describes the available muitations on the model.
 * Users must provide a type which extends this when specifying the mutations on a model via the second type parameter `M` on the `Model<T, M>`.
 */
export type MutationMethods = { [K: string]: MutationFunc<any[], any> };

/**
 * MutationRegistration represents either a MutationFunc itself or an object containing a MutationFunc and its options.
 * It's used when registering a mutation method on a model.
 *
 * @template M The type of the MutationFunc to register.
 */
export type MutationRegistration<M extends MutationFunc> = M | MutationRegistrationWithOptions<M>;

/**
 * MutationRegistrationWithOptions is an object containing a MutationFunc and its options.
 *
 * @template M The type of the MutationFunc to register.
 */
export type MutationRegistrationWithOptions<M extends MutationFunc> = {
  /**
   * The mutation function to register.
   */
  func: M;
  /**
   * Default options to apply to this mutation. Can be overridden by invocation-specific options.
   */
  options: MutationOptions;
};

/**
 * MutationInvocationParams are parameters passed when invoking a mutation method via $expect.
 */
export type MutationInvocationParams = {
  /**
   * A set of expected events for this mutation that will be optimistically applied and which are
   * expected to be confirmed by the backend.
   */
  events: Event[];
  /**
   * Options that can be used to override any configured mutation options for a specific mutation invocation.
   */
  options?: MutationOptions;
};

/**
 * MutationOptimisticInvocation describes the type of a mutation that is invoked via $expect.
 * It differs from a direct invocation in that it returns a tuple.
 * The first element of the tuple is the result of invoking the original method.
 * The second element is a Promise<void> which gets resolved the mutation's expected events are confirmed.
 *
 * @template M The type of the original MutationFunc that was registered on the model.
 */
export type MutationOptimisticInvocation<M extends MutationFunc> = (
  ...args: Parameters<M>
) => Promise<[Awaited<ReturnType<M>>, Promise<void>]>;

/**
 * MutationInvocation describes the two ways in which a MutationFunc can be invoked: either directly,
 * or via a $expect method which permits the caller to provide a set of parameters specific to this mutation
 * invocation (which includes its expected events).
 *
 * @template M The type of the original MutationFunc that was registered on the model.
 */
export type MutationInvocation<M extends MutationFunc> = M & {
  $expect: (params: MutationInvocationParams) => MutationOptimisticInvocation<M>;
};

/**
 * MethodWithExpect represents the set of MutationMethods registered on the model, wrapped in a MutationInvocation
 * to order to support invoking each mutation either directly or via $expect.
 *
 * @template M The mutation methods type.
 */
export type MethodWithExpect<M extends MutationMethods> = {
  [K in keyof M]: MutationInvocation<M[K]>;
};
