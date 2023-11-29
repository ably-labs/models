import type { Logger } from 'pino';

import { toError } from './Errors.js';
import type { OptimisticEventWithParams, ConfirmedEvent } from './types/model.js';

export type EventHandler = (err: Error | null, event: OptimisticEventWithParams | ConfirmedEvent) => Promise<void>;

export default class EventQueue {
  private queue: Array<OptimisticEventWithParams | ConfirmedEvent> = [];
  private isProcessing: boolean = false;

  private readonly baseLogContext: Partial<{ scope: string; action: string }>;

  constructor(
    private readonly logger: Logger,
    private eventHandler: EventHandler,
  ) {
    this.baseLogContext = { scope: `EventQueue` };
  }

  public enqueue(event: OptimisticEventWithParams | ConfirmedEvent): void {
    this.logger.trace({ ...this.baseLogContext, action: 'enqueue()' });
    this.queue.push(event);
    this.processNext();
  }

  public reset() {
    this.queue = [];
    this.isProcessing = false;
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }
    this.logger.trace({ ...this.baseLogContext, action: 'processNext()' });

    this.isProcessing = true;
    const event = this.queue.shift();

    if (event) {
      try {
        await this.eventHandler(null, event);
      } catch (err) {
        this.logger.error({ ...this.baseLogContext, action: 'enqueue()', err });
        await this.eventHandler(toError(err), event);
      } finally {
        this.isProcessing = false;
        this.processNext();
      }
    }
  }
}
