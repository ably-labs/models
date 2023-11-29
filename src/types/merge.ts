import type { OptimisticEvent, ConfirmedEvent } from './model';

/**
 * An function which is invoked with the latest model state (either confirmed or optimistic)
 * and an event (either confirmed or optimistic) and returns the resultant model state.
 * @template T The type of the model state.
 * @param {T} state The latest model state.
 * @param {OptimisticEvent | ConfirmedEvent} event - The event to apply to the model state.
 * @returns {Promise<T>} A promise containing the resultant model state.
 */
export type MergeFunc<T> = (state: T, event: OptimisticEvent | ConfirmedEvent) => Promise<T>;
