import type { Realtime } from 'ably';
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
  /**
   * The Ably Realtime client.
   */
  ably: Realtime;
  /**
   * The name of the channel to use for the model.
   */
  channelName: string;
  /**
   * The logger to use for the model.
   */
  logger: Logger;
  /**
   * Options used to configure the sync behaviour of the model.
   */
  syncOptions: SyncOptions;
  /**
   * Options used to configure the optimistic event behaviour of the model.
   */
  optimisticEventOptions: OptimisticEventOptions;
  /**
   * Options used to configure the event buffer behaviour of the model.
   */
  eventBufferOptions: EventBufferOptions;
};

/**
 * Base options used to configure model instances.
 * @property {LevelWithSilent} logLevel - The log level to use for the model.
 * @interface
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
 * @template S - The sync function type.
 * @property {string} name - The name of the model.
 * @property {string} channelName - The name of the channel used by the model.
 * @interface
 */
export type ModelSpec<S extends SyncFuncConstraint> = {
  channelName: string;
} & Registration<S>;

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
   * The model has errored processing data from the sync, or from the stream.
   */
  | 'errored'
  /**
   * The model has been disposed, either by the user disposing it or an unrecoverable error,
   * and its resources are available for garbage collection.
   */
  | 'disposed';

/**
 * Represents a change event that can be applied to a model via a merge function.
 */
export type Event = {
  /**
   * The ID of the mutation that caused the event.
   */
  mutationId: string;
  /**
   * The name of the event.
   */
  name: string;
  /**
   * The data associated with the event.
   */
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
  /**
   * Optimistic events are never confirmed.
   */
  confirmed: false;
};

/**
 * A message ID used to identify an event. Used for message seeking.
 */
export type MessageId = string | number;
/**
 * An event received from the backend over Ably that represents a confirmed change on the underlying state in the database.
 */
export type ConfirmedEvent = Event & {
  /**
   * Confirmed events are always confirmed.
   */
  confirmed: true;
  /**
   * The sequence ID of the event.
   */
  sequenceId: string;
  /**
   * If true, indicates that the backend is (asynchronously) explicitly rejecting this optimistic change.
   * This is useful if the server cannot reject the change synchronously with the mutation request
   * (such as if the rejection occurred after the backend sent a response).
   * This field is set to `true` if. there is an `x-ably-models-reject: true` header in the message extras.
   * @see https://ably.com/docs/api/realtime-sdk/messages?lang=nodejs#extras
   */
  rejected: boolean;
};

/**
 * Decorates an optimistic event with event-specific parameters.
 */
export type OptimisticEventWithParams = OptimisticEvent & {
  /**
   * The parameters to decorate the event with.
   */
  params: EventParams;
};

/**
 * Defines a function which the library will use to pull the latest state of the model from the backend.
 * Invoked on initialisation and whenever some discontinuity occurs that requires a re-sync.
 * @template F - The sync function type.
 */
export type SyncFunc<F extends SyncFuncConstraint> = F;

/**
 * Captures the return type of the sync function.
 * @template T - The data type returned by the sync function from the backend.
 * @returns {Promise<{data: T, sequenceId: string}>} A promise containing the data from the backend and a sequenceId.
 * @interface
 */
export type SyncReturnType<T> = Promise<{ data: T; sequenceId: MessageId }>;

/**
 * Type constraint for a sync function.
 * @param args - The arguments to the sync function.
 * @returns The return type of the sync function.
 * @callback
 */
export type SyncFuncConstraint = (...args: any[]) => SyncReturnType<any>;

/**
 * Utility type to infer the type of the data payload returned by the sync function.
 * @template F - The sync function type.
 * @template D - The data type returned by the sync function.
 * @param args - The arguments to the sync function.
 * @returns The data type returned by the sync function.
 * @interface
 */
export type ExtractData<F extends SyncFuncConstraint> = F extends (...args: any[]) => SyncReturnType<infer D>
  ? D
  : never;

/**
 * A state transition emitted as an event from the model describing a change to the model's lifecycle.
 */
export type ModelStateChange = {
  /**
   * The current state of the model.
   */
  current: ModelState;
  /**
   * The previous state of the model.
   */
  previous: ModelState;
  /**
   * The error that chased the state change, if any.
   */
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
 * @template S - The sync function type.
 */
export type Registration<S extends SyncFuncConstraint> = {
  /**
   * The sync function used to pull the latest state of the model.
   */
  sync: SyncFunc<S>;
  /**
   * The merge function that is invoked when a message is received.
   */
  merge: MergeFunc<ExtractData<S>>;
};
