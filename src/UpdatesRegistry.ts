import type { Event } from './Model.js';
import { UpdateRegistrationError } from './Errors.js';

export type UpdateFunc<T> = (state: T, event: Event) => Promise<T>;

export type UpdateFuncs<T> = {
  [channel: string]: {
    [event: string]: UpdateFunc<T>[];
  };
};

export type UpdateOptions = {
  channel: string;
  event: string;
};

export default class UpdatesRegistry<T> {
  private registry: UpdateFuncs<T> = {};

  constructor() {}

  register(update: UpdateFunc<T>, { channel, event }: UpdateOptions) {
    if (!this.registry[channel]) {
      this.registry[channel] = {};
    }
    if (!this.registry[channel][event]) {
      this.registry[channel][event] = [];
    }
    this.registry[channel][event].push(update);
  }

  public get(options: Partial<UpdateOptions>) {
    const result: { options: UpdateOptions; func: UpdateFunc<T> }[] = [];
    if (!!options.channel && Object.keys(this.registry).length === 0) {
      throw new UpdateRegistrationError({ channel: options.channel });
    }
    for (const channel in this.registry) {
      if (!!options.channel && options.channel !== channel) {
        continue;
      }
      if (!!options.channel && !this.registry[channel]) {
        throw new UpdateRegistrationError({ channel: options.channel });
      }
      for (const event in this.registry[channel]) {
        if (!!options.event && options.event !== event) {
          continue;
        }
        if (!!options.event && !this.registry[channel][event]) {
          throw new UpdateRegistrationError({ channel: options.channel, event: options.event });
        }
        for (const func of this.registry[channel][event]) {
          result.push({ options: { channel, event }, func });
        }
      }
    }
    if (!!options.event && result.length === 0) {
      throw new UpdateRegistrationError({ event: options.event });
    }
    return result;
  }
}
