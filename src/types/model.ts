import type { Types as AblyTypes } from 'ably/promises';
import type { Logger, LevelWithSilent } from 'pino';

import type { EventComparator, MutationMethods, MutationRegistration } from './mutations';
import type { UpdateFunc } from './updates';

/**
 * Options used to configure all model instances.
 */
export type ModelsOptions = {
  ably: AblyTypes.RealtimePromise;
  logLevel?: LevelWithSilent;
};

/**
 * Options used to configure a model instance.
 */
export type ModelOptions = {
  ably: AblyTypes.RealtimePromise;
  logger: Logger;
};

/**
 * ModelState represents the possible lifecycle states of a model.
 */
export type ModelState =
  /**
   * The model has been initialized but no attach has yet been attempted.
   */
  | 'initialized'
  /**
   * The model is attempting to synchronise its state via a synchronisation call.
   * The preparing state is entered as soon as the library has completed initialization,
   * and is reentered each time there is a discontinuity in one of the underlying streams,
   * or if there is an error updating the model.
   */
  | 'preparing'
  /**
   * The model's underlying streams are in the READY state and the model is operating correctly.
   */
  | 'ready'
  /**
   * The user has paused the model and its' underlying streams.
   */
  | 'paused'
  /**
   * The model has been disposed, either by the user disposing it or an unrecoverable error,
   * and its resources are available for garbage collection.
   */
  | 'disposed';

/**
 * Represents a change event that can be applied to a model via an update function.
 */
export type Event = {
  channel: string;
  name: string;
  data?: any;
};

/**
 * Parameters which can be used to decorate a specific event.
 */
export type EventParams = {
  /**
   * The time within which an optimistic event should be confirmed.
   */
  timeout: number;
  /**
   * A function used to correlate optimistic events with the confirmed counterparts.
   */
  comparator: EventComparator;
};

/**
 * An event that is emitted locally only in order to apply local optimistic updates to the model state.
 */
export type OptimisticEvent = Event & {
  confirmed: false;
};

/**
 * An event received from the backend over Ably that represents a confirmed mutation on the underlying state in the database.
 */
export type ConfirmedEvent = Event & {
  confirmed: true;
};

/**
 * Decorates an optimistic event with event-specific parameters.
 */
export type OptimisticEventWithParams = OptimisticEvent & {
  params: EventParams;
};

/**
 * Defines a function which the library will use to pull the latest state of the model from the backend.
 * Invoked on initialisation and whenever some discontinuity occurs that requires a re-sync.
 */
export type SyncFunc<T> = () => Promise<T>;

/**
 * A state transition emitted as an event from the model describing a change to the model's lifecycle.
 */
export type ModelStateChange = {
  current: ModelState;
  previous: ModelState;
  reason?: Error;
};

/**
 * Options used to configure a subscription to model data changes.
 */
export type SubscriptionOptions = {
  /**
   * If true, the subscription callback is invoked for local optimistic updates.
   * If false, it is invoked only with confirmed changes to the model data.
   */
  optimistic: boolean;
};

/**
 * A type used to capture the bulk registration of the required methods on the model.
 */
export type Registration<T, M extends MutationMethods> = {
  /**
   * The sync function used to pull the latest state of the model.
   */
  $sync: SyncFunc<T>;
  /**
   * A mapping of channel name to event to an update function that is invoked when a message
   * is received matching that channel and event name.
   */
  $update?: {
    [channel: string]: {
      [event: string]: UpdateFunc<T>;
    };
  };
  /**
   * A mapping of method names to mutations describing the mutations that are available on the model that
   * can be invoked to mutate the underlying state of the model in the backend database.
   */
  $mutate?: { [K in keyof M]: MutationRegistration<M[K]> };
};