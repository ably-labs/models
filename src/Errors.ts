import type { UpdateTargets } from './UpdatesRegistry.js';
import toString from 'lodash/toString';

export function toError(err: any) {
  return err instanceof Error ? err : new Error(toString(err));
}

export class RegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationError';
  }
}

export class UpdateRegistrationError extends RegistrationError {
  constructor(targets: Partial<UpdateTargets>) {
    let message = 'update not registered';
    if (targets.channel && !targets.event) {
      message = `update for channel ${targets.channel} not registered`;
    } else if (!targets.channel && targets.event) {
      message = `update for event ${targets.event} not registered`;
    } else if (targets.channel && targets.event) {
      message = `update for event ${targets.event} on channel ${targets.channel} not registered`;
    }
    super(message);
    this.name = 'UpdateRegistrationError';
  }
}
