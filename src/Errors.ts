import type { UpdateOptions } from './Updates.js';

export class RegistrationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegistrationError';
  }
}

export class UpdateRegistrationError extends Error {
  constructor(options: Partial<UpdateOptions>) {
    let message = 'update not registered';
    if (options.channel && !options.event) {
      message = `update for channel ${options.channel} not registered`;
    } else if (!options.channel && options.event) {
      message = `update for event ${options.event} not registered`;
    } else if (options.channel && options.event) {
      message = `update for event ${options.event} on channel ${options.channel} not registered`;
    }
    super(message);
    this.name = 'RegistrationError';
  }
}
