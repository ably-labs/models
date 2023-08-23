import toString from 'lodash/toString';

import type { UpdateTargets } from './UpdatesRegistry.js';

export function toError(err: any) {
  return err instanceof Error || err instanceof AggregateError ? err : new Error(toString(err));
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

/**
 * Represents an error that occurs when a given update function specified by
 * the target is not registered on the model.
 *
 * @internal
 * @extends {RegistrationError}
 */
export class UpdateRegistrationError extends RegistrationError {
  constructor(targets: Partial<UpdateTargets>) {
    let message = 'update not registered';
    if (targets.channel && !targets.event) {
      message = `update for channel '${targets.channel}' not registered`;
    } else if (!targets.channel && targets.event) {
      message = `update for event '${targets.event}' not registered`;
    } else if (targets.channel && targets.event) {
      message = `update for event '${targets.event}' on channel '${targets.channel}' not registered`;
    }
    super(message);
    this.name = 'UpdateRegistrationError';
  }
}
