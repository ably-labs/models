import type { OptimisticEvent, ConfirmedEvent } from './model';

/**
 * An function which is invoked with the latest model state (either confirmed or optimistic)
 * and an event (either confirmed or optimistic) and returns the resultant model state.
 */
export type UpdateFunc<T> = (state: T, event: OptimisticEvent | ConfirmedEvent) => Promise<T>;

/**
 * A mapping of channel to event name to update function which determines the update function to
 * invoke when an event with a given name is received on a particular channel.
 */
export type UpdateFuncs<T> = {
  [channel: string]: {
    [event: string]: UpdateFunc<T>[];
  };
};
