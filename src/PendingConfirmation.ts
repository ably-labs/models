import type { Event, OptimisticEventWithParams } from './types/model';

type ResolveFn<T> = (value: T | PromiseLike<T>) => void;
type RejectFn = (reason?: Error) => void;

export default class PendingConfirmation {
  private events: OptimisticEventWithParams[];
  private timeoutId: ReturnType<typeof setTimeout>;
  private done: boolean = false;
  private confirmationPromise: Promise<void>;

  // The promise executor is always invoked synchronously, so
  // these assignments will be made before the constructor returns.
  private resolve!: ResolveFn<void>;
  private reject!: RejectFn;

  constructor(readonly timeout: number, events: OptimisticEventWithParams[]) {
    this.events = events;
    this.confirmationPromise = new Promise<void>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    this.timeoutId = setTimeout(async () => {
      await this.finalise(new Error('timed out waiting for event confirmation'));
    }, timeout);
  }

  get isDone(): boolean {
    return this.done;
  }

  get promise(): Promise<void> {
    return this.confirmationPromise;
  }

  async finalise(err?: Error) {
    if (this.done) {
      return;
    }
    this.done = true;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    if (err) {
      return this.reject(err);
    }
    return this.resolve();
  }

  async removeMatchingEvents(events: Event[], err?: Error) {
    for (const event of events) {
      this.events = this.events.filter((e) => !e.params.comparator(e, event));
    }
    if (this.events.length === 0) {
      await this.finalise(err);
    }
  }
}
