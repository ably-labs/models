import { ExtractData, SyncFuncConstraint } from './model.js';

/**
 * Standard callback type for async functions.
 * @param {Error} err The error, if any.
 * @param {T} result The result, if no error.
 * @template T - result The result, if no error.
 */
export type StandardCallback<T> = {
  (err: Error): void;
  (err: null, result: T): void;
};

/**
 * A callback that can be subscribed or undsubscribed from model state changes
 * @template S - The type of the model state.
 * @param {Error | null} err - The error, if any.
 * @param {ExtractData<S>} result - The result, if no error.
 */
export type SubscriptionCallback<S extends SyncFuncConstraint> = (err: Error | null, result?: ExtractData<S>) => void;
