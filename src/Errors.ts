import toString from 'lodash/toString';

export function toError(err: any) {
  return err instanceof Error ? err : new Error(toString(err));
}

/**
 * Represents an error that occurs when registering or using
 * sync, update and mutation methods.
 *
 * @internal
 * @extends {Error}
 */
export class RegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationError';
  }
}
