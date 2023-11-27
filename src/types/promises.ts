/**
 * A function invoked when a promise is resolved.
 * @template T The type of the promise.
 * @param {T | PromiseLike<T>} value The value the promise was resolved with.
 */
export type ResolveFn<T> = (value: T | PromiseLike<T>) => void;
/**
 * A function invoked when a promise is rejected.
 * @param {Error} reason The reason the promise was rejected.
 */
export type RejectFn = (reason?: Error) => void;
