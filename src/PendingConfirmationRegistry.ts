import PendingConfirmation from './PendingConfirmation.js';
import { OptimisticEvent, OptimisticEventWithParams } from './types/model.js';
import type { ConfirmedEvent } from './types/model.js';

export default class PendingConfirmationRegistry {
  private pendingConfirmations: PendingConfirmation[] = [];

  constructor() {}

  async add(events: OptimisticEventWithParams[]) {
    let timeout = events[0].params.timeout; // todo pick better timeout? minimum?
    const pendingConfirmation = new PendingConfirmation(timeout, events);
    this.pendingConfirmations.push(pendingConfirmation);
    return pendingConfirmation;
  }

  async confirmEvents(events: ConfirmedEvent[]) {
    for (let pendingConfirmation of this.pendingConfirmations) {
      await pendingConfirmation.removeMatchingEvents(events);
    }
  }

  async rejectEvents(err: Error, events: OptimisticEvent[]) {
    for (let i = this.pendingConfirmations.length - 1; i >= 0; i--) {
      let pendingConfirmation = this.pendingConfirmations[i];
      await pendingConfirmation.removeMatchingEvents(events, err);
      if (pendingConfirmation.isDone) {
        this.pendingConfirmations.splice(i, 1);
      }
    }
  }

  async finalise(err?: Error) {
    for (const pendingConfirmation of this.pendingConfirmations) {
      await pendingConfirmation.finalise(err);
    }
  }
}
