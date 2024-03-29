import PendingConfirmation from './PendingConfirmation.js';
import { OptimisticEvent, OptimisticEventWithParams } from './types/model.js';
import type { ConfirmedEvent } from './types/model.js';
import { EventComparator } from './types/optimistic.js';

export default class PendingConfirmationRegistry {
  private pendingConfirmations: PendingConfirmation[] = [];

  constructor(private readonly comparator: EventComparator) {}

  async add(events: OptimisticEventWithParams[]) {
    let timeout = Math.min(...events.map((e) => e.params.timeout));
    const pendingConfirmation = new PendingConfirmation(timeout, events, this.comparator);
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
