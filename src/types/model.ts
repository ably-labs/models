import type { Types as AblyTypes } from 'ably/promises';
import type { Logger } from 'pino';
import type { LevelWithSilent } from 'pino';

import type { OptionalFields, OptionalValues } from './helpers.js';
import type { MergeFunc } from './merge';
import type { SyncOptions, OptimisticEventOptions } from './optimistic';
import type { EventBufferOptions } from './stream';

/**
 * Options used to configure a model instance.
 */
export type ModelOptions = {
  ably: AblyTypes.RealtimePromise;
  channelName: string;
  logger: Logger;
  syncOptions: SyncOptions;
  optimisticEventOptions: OptimisticEventOptions;
  eventBufferOptions: EventBufferOptions;
};

/**
 * Base options used to configure model instances.
 */
export type ModelsOptions = OptionalValues<
  OptionalFields<
    Omit<ModelOptions, 'logger' | 'channelName'> & { logLevel?: LevelWithSilent },
    'optimisticEventOptions' | 'eventBufferOptions' | 'syncOptions'
  >,
  'optimisticEventOptions' | 'eventBufferOptions' | 'syncOptions'
>;

/**
 * Identifies a model created or accessed from the ModelsClient.
 */
export type ModelSpec<T> = { name: string; channelName: string } & Registration<T>;

/**
 * ModelState represents the possible lifecycle states of a model.
 */
export type ModelState =
  /**
   * The model has been initialized but no attach has yet been attempted.
   */
  | 'initialized'
  /**
   * The model is synchronising its state.
   */
  | 'syncing'
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
  mutationID: string;
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
};

/**
 * An event that is emitted locally only in order to apply local optimistic updates to the model state.
 */
export type OptimisticEvent = Event & {
  confirmed: false;
};

/**
 * An event received from the backend over Ably that represents a confirmed change on the underlying state in the database.
 */
export type ConfirmedEvent = Event & {
  confirmed: true;
  sequenceID: string;
  /**
   * If true, indicates that the backend is (asynchronously) explicitly rejecting this optimistic change.
   * This is useful if the server cannot reject the change synchronously with the mutation request
   * (such as if the rejection occurred after the backend sent a response).
   * This field is set to `true` iff. there is an `x-ably-models-reject: true` header in the message extras.
   * @see https://ably.com/docs/api/realtime-sdk/messages?lang=nodejs#extras
   */
  rejected: boolean;
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
export type SyncFunc<T> = () => Promise<{ data: T; sequenceID: string }>;

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
export type Registration<T> = {
  /**
   * The sync function used to pull the latest state of the model.
   */
  sync: SyncFunc<T>;
  /**
   * The merge function that is invoked when a message is received.
   */
  merge?: MergeFunc<T>;
};
