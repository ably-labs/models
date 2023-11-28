/**
 * OptionalFields extends a type to allows specific fields to be undefined.
 * @template T The type to extend.
 * @template K The keys of the fields to allow to be undefined.
 */
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * OptionalFieldsExcept extends a type to allow all fields to be undefined with some exceptions.
 * @template T The type to extend.
 * @template K The keys of the fields to require.
 */
export type OptionalFieldsExcept<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;

/**
 * OptionalValues extends a type to allow the fields on the value of a specific field to be undefined.
 * @template T The type to extend.
 * @template K The key of the field to allow to be undefined.
 */
export type OptionalValues<T, K extends keyof T> = Omit<T, K> & { [P in K]: Partial<T[K]> };

/**
 * RequiredFields extends a type to require that specific fields are defined.
 * @template T The type to extend.
 * @template K The keys of the fields to require.
 */
export type RequiredFields<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
