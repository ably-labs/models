import { Types as AblyTypes } from 'ably';

import type { EventOrderer } from '../types/optimistic.js';

abstract class MiddlewareBase {
  private outputCallbacks: ((error: Error | null, message: AblyTypes.Message | null) => void)[] = [];

  protected next(message: AblyTypes.Message): void {
    this.outputCallbacks.forEach((cb) => cb(null, message));
  }

  protected error(error: Error): void {
    this.outputCallbacks.forEach((cb) => cb(error, null));
  }

  public subscribe(callback: (error: Error | null, message: AblyTypes.Message | null) => void): void {
    this.outputCallbacks.push(callback);
  }

  public unsubscribe(callback: (error: Error | null, message: AblyTypes.Message | null) => void): void {
    const index = this.outputCallbacks.indexOf(callback);
    if (index !== -1) {
      this.outputCallbacks.splice(index, 1);
    }
  }

  public unsubscribeAll(): void {
    this.outputCallbacks = [];
  }
}

export class SequenceResumer extends MiddlewareBase {
  private state: 'pending' | 'active' | 'error' = 'pending';
  private lastMessageId: string | null = null;
  private hasCrossedBoundary = false;

  constructor(private sequenceID: string) {
    super();
  }

  public next(message: AblyTypes.Message): void {
    if (this.state === 'error') {
      return;
    }

    if (this.lastMessageId && this.compareIds(message.id, this.lastMessageId) < 0) {
      this.state = 'error';
      this.error(new Error(`out-of-sequence message received: ${message.id} after ${this.lastMessageId}`));
      return;
    }

    this.lastMessageId = message.id;

    switch (this.state) {
      case 'pending':
        if (this.compareIds(message.id, this.sequenceID) <= 0) {
          // track that we've seen a message before the boundary and skip
          this.hasCrossedBoundary = true;
          return;
        } else if (this.compareIds(message.id, this.sequenceID) > 0) {
          if (!this.hasCrossedBoundary) {
            // if we haven't seen a message before the boundary, we cannot guarantee that we have
            // looked far back enough in the message stream to process all messages after the boundary
            this.state = 'error';
            this.error(
              new Error(
                `received message ${message.id} after the boundary at ${this.sequenceID} without seeing one before it`,
              ),
            );
            return;
          }
          // we have crossed the boundary and can process the message
          this.state = 'active';
          super.next(message);
          return;
        }
        break;
      case 'active':
        super.next(message);
        break;
    }
  }

  private compareIds(a: string, b: string): number {
    return a.localeCompare(b, 'en-US', { numeric: true });
  }
}

// TODO unify orderer
function defaultOrderLexicoId(a: AblyTypes.Message, b: AblyTypes.Message): number {
  if (a.id < b.id) {
    return -1;
  }

  if (a.id === b.id) {
    return 0;
  }

  return 1;
}

export class SlidingWindow extends MiddlewareBase {
  private messages: AblyTypes.Message[] = [];

  constructor(
    private readonly windowSizeMs: number,
    private readonly eventOrderer: EventOrderer = defaultOrderLexicoId,
  ) {
    super();
  }

  public next(message: AblyTypes.Message): void {
    if (this.windowSizeMs === 0) {
      super.next(message);
      return;
    }

    if (this.messages.map((msg) => msg.id).includes(message.id)) {
      return;
    }

    this.messages.push(message);
    this.messages.sort(this.eventOrderer);

    setTimeout(() => {
      this.expire(message);
    }, this.windowSizeMs);
  }

  private expire(message: AblyTypes.Message): void {
    const idx = this.messages.indexOf(message);

    if (idx === -1) {
      return;
    }

    const expiredMessages = this.messages.splice(0, idx + 1);
    expiredMessages.forEach((message) => super.next(message));
  }
}

export class OrderedSequenceResumer extends MiddlewareBase {
  private sequenceResumer: SequenceResumer;
  private slidingWindow: SlidingWindow;

  constructor(
    private sequenceID: string,
    private readonly windowSizeMs: number,
    private readonly eventOrderer: EventOrderer = defaultOrderLexicoId,
  ) {
    super();
    this.sequenceResumer = new SequenceResumer(this.sequenceID);
    this.slidingWindow = new SlidingWindow(this.windowSizeMs, this.eventOrderer);
    this.sequenceResumer.subscribe((err, message) => (err ? this.error(err) : super.next(message!)));
    this.slidingWindow.subscribe((err, message) => (err ? this.error(err) : this.sequenceResumer.next(message!)));
  }

  public next(message: AblyTypes.Message) {
    this.slidingWindow.next(message);
  }

  public unsubscribe(callback: (error: Error | null, message: AblyTypes.Message | null) => void): void {
    this.slidingWindow.unsubscribe(callback);
    this.sequenceResumer.unsubscribe(callback);
    super.unsubscribe(callback);
  }

  public unsubscribeAll(): void {
    this.slidingWindow.unsubscribeAll();
    this.sequenceResumer.unsubscribeAll();
    super.unsubscribeAll();
  }
}
