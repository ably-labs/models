export type StandardCallback<T> = {
  (err: Error): void;
  (err: null, result: T): void;
};
