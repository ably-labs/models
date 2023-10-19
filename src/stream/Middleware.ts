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

  protected compareIds(a: string, b: string): number {
    return a.localeCompare(b, 'en-US', { numeric: true });
  }

  protected messageIdBeforeInclusive(a: string, b: string) {
    return this.compareIds(a, b) <= 0;
  }

  protected messageIdBeforeExclusive(a: string, b: string) {
    return this.compareIds(a, b) < 0;
  }

  protected messageIdAfter(a: string, b: string) {
    return this.compareIds(a, b) > 0;
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

// TODO handle case when cannot paginate far back enough before finding sequence
export class OrderedHistoryResumer extends MiddlewareBase {
  private currentState: 'seeking' | 'ready' = 'seeking';
  private historicalMessages: AblyTypes.Message[] = [];
  private realtimeMessages: AblyTypes.Message[] = [];
  private slidingWindow: SlidingWindow;

  constructor(
    private sequenceID: string,
    private readonly windowSizeMs: number,
    private readonly eventOrderer: EventOrderer = defaultOrderLexicoId,
  ) {
    super();
    this.slidingWindow = new SlidingWindow(this.windowSizeMs, this.eventOrderer);
    this.slidingWindow.subscribe(this.onMessage.bind(this));
  }

  public get state() {
    return this.currentState;
  }

  private onMessage(err: Error | null, message: AblyTypes.Message | null) {
    if (err) {
      super.error(err);
      return;
    }
    super.next(message!);
  }

  private reverseOrderer(a: AblyTypes.Message, b: AblyTypes.Message) {
    return this.eventOrderer(a, b) * -1;
  }

  public addHistoricalMessages(messages: AblyTypes.Message[]): boolean {
    if (this.currentState !== 'seeking') {
      throw new Error('can only add historical messages while in seeking state');
    }
    if (messages.length === 0) {
      return true;
    }
    this.historicalMessages = this.historicalMessages.concat(messages);

    // We sort the historical messages to handle any out-of-orderiness by sequenceID
    // due to possible CGO order.
    // It is not optimal to sort the entire thing with each page as out-of-orderiness
    // is localised within a two minute window, but being more clever about this requires
    // tracking message timestamps and complicates the logic.
    // Given the number of messages is likely to be reasonably small, this approach is okay for now.
    //
    // Note that because of potential out-of-orderiness by sequenceID due to possible CGO order,
    // it's possible this function discovers the boundary in the stream but a more recent message appears
    // further back in the stream outside of the given page. A larger page size reduces this likelihood but
    // doesn't solve it. The solution would require paging back 2 mins further to check for any such messages.
    // This is sufficiently low likelihood that this can be ignored for now.
    this.historicalMessages.sort(this.reverseOrderer.bind(this));

    // seek backwards through history until we reach a message id <= the specified sequenceID
    // (discarding anything older) before flushing out all messages > the sequenceID
    for (let i = 0; i < this.historicalMessages.length; i++) {
      if (this.messageIdBeforeInclusive(this.historicalMessages[i].id, this.sequenceID)) {
        if (this.historicalMessages[i].id === this.sequenceID) {
          i++;
        }
        this.historicalMessages.splice(0, i);
        this.flush();
        return true;
      }
    }
    return false;
  }

  public flush() {
    for (const message of this.historicalMessages) {
      // we send historical messages through the sliding window too to catch
      // any potential out-of-orderiness by sequenceID at the attach boundary
      this.slidingWindow.next(message);
    }
    for (const message of this.realtimeMessages) {
      this.slidingWindow.next(message);
    }
    this.historicalMessages = [];
    this.currentState = 'ready';
  }

  public addLiveMessages(message: AblyTypes.Message) {
    if (this.currentState === 'seeking') {
      this.realtimeMessages.push(message);
      return;
    }
    this.slidingWindow.next(message);
  }

  public unsubscribeAll(): void {
    this.slidingWindow.unsubscribe(this.onMessage.bind(this));
    super.unsubscribeAll();
  }
}
