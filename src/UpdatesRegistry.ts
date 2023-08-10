import { UpdateRegistrationError } from './Errors.js';
import type { UpdateFunc, UpdateFuncs } from './types/updates.js';

export type UpdateTargets = {
  channel: string;
  event: string;
};

export default class UpdatesRegistry<T> {
  private registry: UpdateFuncs<T> = {};

  constructor() {}

  register(update: UpdateFunc<T>, { channel, event }: UpdateTargets) {
    if (!this.registry[channel]) {
      this.registry[channel] = {};
    }
    if (!this.registry[channel][event]) {
      this.registry[channel][event] = [];
    }
    this.registry[channel][event].push(update);
  }

  public get(targets: Partial<UpdateTargets>) {
    const result: { targets: UpdateTargets; func: UpdateFunc<T> }[] = [];
    if (!!targets.channel && Object.keys(this.registry).length === 0) {
      throw new UpdateRegistrationError({ channel: targets.channel });
    }
    for (const channel in this.registry) {
      if (!!targets.channel && targets.channel !== channel) {
        continue;
      }
      if (!!targets.channel && !this.registry[channel]) {
        throw new UpdateRegistrationError({ channel: targets.channel });
      }
      for (const event in this.registry[channel]) {
        if (!!targets.event && targets.event !== event) {
          continue;
        }
        if (!!targets.event && !this.registry[channel][event]) {
          throw new UpdateRegistrationError({ channel: targets.channel, event: targets.event });
        }
        for (const func of this.registry[channel][event]) {
          result.push({ targets: { channel, event }, func });
        }
      }
    }
    if (!!targets.event && result.length === 0) {
      throw new UpdateRegistrationError({ event: targets.event });
    }
    return result;
  }
}
