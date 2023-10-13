import type { OptimisticEvent, ConfirmedEvent } from './model';

/**
 * An function which is invoked with the latest model state (either confirmed or optimistic)
 * and an event (either confirmed or optimistic) and returns the resultant model state.
 */
export type MergeFunc<T> = (state: T, event: OptimisticEvent | ConfirmedEvent) => Promise<T>;
