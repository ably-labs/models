/**
 * OptionalFields extends a type to allows specific fields to be undefined.
 */
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * OptionalFieldsExcept extends a type to allow all fields to be undefined with some exceptions.
 */
export type OptionalFieldsExcept<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;

/**
 * OptionalValues extends a type to allow the fields on the value of a specific field to be undefined.
 */
export type OptionalValues<T, K extends keyof T> = Omit<T, K> & { [P in K]: Partial<T[K]> };
