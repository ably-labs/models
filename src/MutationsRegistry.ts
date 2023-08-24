import isEqual from 'lodash/isEqual.js';
import toString from 'lodash/toString.js';
import { v4 as uuidv4 } from 'uuid';

import { toError } from './Errors.js';
import type { Event, OptimisticEventWithParams } from './types/model.js';
import type {
  MutationFunc,
  EventComparator,
  MutationOptions,
  MutationRegistration,
  MutationMethods,
  MethodWithExpect,
  MutationInvocationParams,
  MutationRegistrationWithOptions,
  MutationInvocation,
  MutationOptimisticInvocation,
  StrippedMutationFunc,
} from './types/mutations.js';

/**
 * This comparator compares events by equality of channel, event name and deep equality on the event data.
 *
 * @param optimistic - The optimistic event to compare.
 * @param confirmed - The confirmed event to compare.
 * @returns {boolean} Whether the two events are equal.
 */
export const equalityComparator: EventComparator = (optimistic: Event, confirmed: Event) => {
  return (
    optimistic.channel === confirmed.channel &&
    optimistic.name === confirmed.name &&
    isEqual(optimistic.data, confirmed.data)
  );
};

/**
 * This comparator compares events by their `uuid` property.
 *
 * @param optimistic - The optimistic event to compare.
 * @param confirmed - The confirmed event to compare.
 * @returns {boolean} Whether the two events are equal.
 */
export const uuidComparator: EventComparator = (optimistic: Event, confirmed: Event) => {
  return !!optimistic.uuid && !!confirmed.uuid && optimistic.uuid === confirmed.uuid;
};

/**
 * The default event comparator used by all registered mutation functions, unless an override option is provided.
 * Compares events by uuid, if provided on both the optimistic and confirmed events.
 * Otherwise, compares events by equality of channel, event name and deep equality on the event data.
 *
 * @param optimistic - The optimistic event to compare.
 * @param confirmed - The confirmed event to compare.
 * @returns {boolean} Whether the two events are equal.
 */
export const defaultComparator: EventComparator = (optimistic: Event, confirmed: Event) => {
  if (optimistic.uuid && confirmed.uuid) {
    return uuidComparator(optimistic, confirmed);
  }
  return equalityComparator(optimistic, confirmed);
};

/**
 * Default options applied to all registered mutations.
 */
export const DEFAULT_OPTIONS: MutationOptions = {
  timeout: 1000 * 60 * 2,
  comparator: defaultComparator,
};

/**
 * Type-safe helper function to determine whether a mutation is registered directly or along with mutation-specific options.
 * @template M - The mutation function
 * @param {MutationRegistration<T>} method - The method registration
 * @returns {boolean} - Whether the given mutation registration is a MutationFunc or a MutationRegistrationWithOptions.
 */
function isMutationRegistrationWithOptions<M extends MutationFunc<any[], any>>(
  mutationRegistration: MutationRegistration<M>,
): mutationRegistration is MutationRegistrationWithOptions<M> {
  return 'options' in mutationRegistration && 'func' in mutationRegistration;
}

/**
 * MutationCallbacks facilitates custom handling of expected events emitted by mutations.
 *
 * @property apply - Callback to invoke with a mutation's expected events (and configured options) to
 * optimistically apply the events to the model.
 * It should return a tuple of Promise<void>, the first of which resolves when the optimistic
 * updates have been applied and the second of which resolves when the mutation has been confirmed.
 * @property rollback - Callback to invoke with an error and the mutation's expected events to rollback
 * events that were previously applied.
 */
export type MutationCallbacks = {
  apply: (events: OptimisticEventWithParams[]) => Promise<Promise<void>[]>;
  rollback: (err: Error, events: OptimisticEventWithParams[]) => Promise<void>;
};

/**
 * The MutationsRegistry class encapsulates the mutations that can be executed on a given model.
 * It allows you to register mutation methods and invoke them, optionally with a set of expected events.
 *
 * @template M - The type of the mutation methods. This should be a map from method names to the registered mutation function types.
 */
export default class MutationsRegistry<M extends MutationMethods> {
  private methods: Partial<{ [K in keyof M]: MutationRegistration<M[K]> }> = {};

  constructor(readonly callbacks: MutationCallbacks, readonly options?: Partial<MutationOptions>) {}

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

  /**
   * Extracts the user's registered MutationFunc implementation from its registration, by determining
   * whether or not it was registered with options.
   * @param registration The mutation that was registered on the model.
   * @template M The type of the MutationFunc that was registered on the model.
   * @returns {M} The implementation of the MutationFunc.
   */
  private resolveMethod<M extends MutationFunc>(registration: MutationRegistration<M>): M {
    let method: M;
    if (isMutationRegistrationWithOptions(registration)) {
      method = registration.func;
    } else {
      method = registration;
    }
    return method;
  }

  private getOptimisticEvents(params: MutationInvocationParams, options: MutationOptions): OptimisticEventWithParams[] {
    return (
      params?.events?.map((event) => ({
        ...event,
        ...(!event.uuid && { uuid: uuidv4() }),
        confirmed: false,
        params: {
          timeout: options.timeout,
          comparator: options.comparator,
        },
      })) || []
    );
  }

  /**
   * Called when invoking the mutation via $expect.
   * First, it applies the mutation's expected events optimistically.
   * Next, it invokes the mutation function and awaits the result, rolling back the
   * optimistic update if the mutation fails.
   * Finally it returns the result from the mutation function alongside a confirmation
   * promise that resolves when the expected events have been confirmed by the backend.
   *
   * @template M The type of the MutationFunc that was registered on the model.
   */
  private async executeMethod<M extends MutationFunc>(
    method: M,
    params: MutationInvocationParams,
    options: MutationOptions,
    args: Parameters<StrippedMutationFunc<M>>,
  ): Promise<ReturnType<MutationOptimisticInvocation<M>>> {
    const events = this.getOptimisticEvents(params, options);
    let confirmation = Promise.resolve();
    if (events.length) {
      ({ confirmation } = await this.processOptimistic(events));
    }
    try {
      const result: Awaited<ReturnType<StrippedMutationFunc<M>>> = await method({ events: params.events }, ...args);
      if (!events.length) {
        return [result, confirmation];
      }
      const finalConfirmation = this.wrapConfirmation(confirmation, events);
      finalConfirmation.catch(() => {}); // ensure we always have a handler in case the user discards the promise
      return [result, finalConfirmation];
    } catch (mutationErr) {
      confirmation.catch(() => {}); // ensure we have a handler for the promise which will reject on rollback
      await this.callbacks.rollback(toError(mutationErr), events);
      throw toError(mutationErr);
    }
  }

  /**
   * Entry point when a mutation is invoked either directly or via $expect.
   * @template K The name of the registered mutation to invoke.
   * @returns {MutationInvocation<MutationFunc>} The registered mutation function with the given name
   * which can be invoked directly, but is additionally decorated with a $expect method which can be used
   * to provide a set of expected events for this mutation.
   */
  private handleMutation<K extends keyof M>(methodName: K): MutationInvocation<M[K]> {
    const registration: MutationRegistration<M[K]> | undefined = this.methods[methodName];
    if (!registration) {
      throw new Error(`mutation method '${toString(methodName)}' not registered`);
    }

    const originalMethod = this.resolveMethod(registration);

    const method = function (...args: Parameters<StrippedMutationFunc<M[K]>>) {
      return originalMethod({ events: [] }, ...args);
    } as MutationInvocation<M[K]>; // assertion required as we're gradually constructing the intersection type

    method.$expect =
      (params: MutationInvocationParams) =>
      async (...args: Parameters<StrippedMutationFunc<M[K]>>) => {
        let options = Object.assign({}, DEFAULT_OPTIONS);
        if (this.options) {
          options = Object.assign({}, options, this.options);
        }
        if (isMutationRegistrationWithOptions(registration)) {
          options = Object.assign({}, options, registration.options);
        }
        if (params.options) {
          options = Object.assign({}, options, params.options);
        }
        return await this.executeMethod(originalMethod, params, options, args);
      };

    return method;
  }

  /**
   * Externally exposed map of mutation methods, which are augmented with an additional
   * $expect method that can be used to provide expected events when invoking a mutation.
   */
  handler = {} as MethodWithExpect<M>;

  /**
   * Registers a set of mutations by setting up mutation handlers
   * for each method registered on the model.
   */
  public register(registrations: { [K in keyof M]: MutationRegistration<M[K]> }) {
    for (const methodName in registrations) {
      if (this.handler[methodName]) {
        throw new Error(`mutation with name '${methodName}' already registered`);
      }
      const registration = registrations[methodName];
      this.methods[methodName] = registration;
      this.handler[methodName] = this.handleMutation(methodName);
    }
  }
}
