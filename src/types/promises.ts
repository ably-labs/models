export type ResolveFn<T> = (value: T | PromiseLike<T>) => void;
export type RejectFn = (reason?: Error) => void;
