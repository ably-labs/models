import toString from 'lodash/toString';

export function toError(err: any) {
  return err instanceof Error ? err : new Error(toString(err));
}

/**
 * Represents an error that occurs during registration.
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

/**
 * Represents an error that occurs when the underlying ably channel detects a discontinuity due to disconnection.
 *
 * @internal
 * @extends {Error}
 */
export class StreamDiscontinuityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamDiscontinuityError';
  }
}

/*
 * Represents an error that occurs by passing incorrect arguments to a public method.
 *
 * @extends {Error}
 */
export class InvalidArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidArgumentError';
  }
}
