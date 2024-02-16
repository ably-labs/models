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

export function lexicographicOrderer(a: string | number, b: string | number): number {
  if (a < b) {
    return -1;
  }
  if (a === b) {
    return 0;
  }
  return 1;
}

export function numericOtherwiseLexicographicOrderer(a: string, b: string): number {
  let idA: number | string, idB: number | string;
  try {
    idA = Number(a);
    idB = Number(b);
  } catch (err) {
    idA = a;
    idB = b;
  }
  return lexicographicOrderer(idA, idB);
}

export class SlidingWindow extends MiddlewareBase {
  private messages: AblyTypes.Message[] = [];

  constructor(
    private readonly windowSizeMs: number,
    private readonly eventOrderer: EventOrderer = numericOtherwiseLexicographicOrderer,
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
    this.messages.sort((a, b) => this.eventOrderer(a.id, b.id));

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

/**
 * Middleware which emits messages from a position in the stream determined by a sequenceId.
 * The caller paginates back through history and passes in each page which the middleware
 * uses to seek for the specified position. Concurrently, incoming live messages can be buffered.
 * Messages are re-ordered according to the sequence ID. For historical messages, the entire history
 * is re-ordered; for live messages a sliding window is applied.
 * When the position is reached, the middleware emits all messages in-order from the resume position
 * forwards, which includes the historical plus the live messages.
 * Subsequently live messages can continue to be added, re-ordered within a sliding window, and emitted.
 */
export class OrderedHistoryResumer extends MiddlewareBase {
  private currentState: 'seeking' | 'success' = 'seeking';
  private historicalMessages: AblyTypes.Message[] = [];
  private realtimeMessages: AblyTypes.Message[] = [];
  private slidingWindow: SlidingWindow;

  constructor(
    private sequenceId: string,
    private readonly windowSizeMs: number,
    private readonly eventOrderer: EventOrderer = numericOtherwiseLexicographicOrderer,
  ) {
    super();
    this.slidingWindow = new SlidingWindow(this.windowSizeMs, this.eventOrderer);
    this.slidingWindow.subscribe(this.onMessage.bind(this));
  }

  private onMessage(err: Error | null, message: AblyTypes.Message | null) {
    if (err) {
      super.error(err);
      return;
    }
    super.next(message!);
  }

  private reverseOrderer(a: string, b: string) {
    return this.eventOrderer(a, b) * -1;
  }

  private messageBeforeInclusive(a: string, b: string) {
    return this.eventOrderer(a, b) <= 0;
  }

  public get state() {
    return this.currentState;
  }

  public addHistoricalMessages(messages: AblyTypes.Message[]): boolean {
    if (this.currentState !== 'seeking') {
      throw new Error('can only add historical messages while in seeking state');
    }
    // It is possible that we retrieve a page of history that is empty, such as when
    // the messages expired before the next page was requested.
    if (messages.length === 0) {
      // If there were some messages in history then there have definitely been changes to the state
      // and we can't reach back far enough to resume from the correct point.
      const noHistory = this.historicalMessages.length === 0;
      this.flush();
      if (noHistory) {
        this.currentState = 'success';
      }
      return true;
    }
    this.historicalMessages = this.historicalMessages.concat(messages);

    // We sort the historical messages to handle any out-of-orderiness by sequenceId
    // due to possible CGO order.
    // It is not optimal to sort the entire thing with each page as out-of-orderiness
    // is localised within a two minute window, but being more clever about this requires
    // tracking message timestamps and complicates the logic.
    // Given the number of messages is likely to be reasonably small, this approach is fine.
    //
    // Note that because of potential out-of-orderiness by sequenceId due to possible CGO order,
    // it's possible this function discovers the boundary in the stream but a more recent message appears
    // further back in the stream outside of the given page. A larger page size reduces this likelihood but
    // doesn't solve it. The solution would require paging back 2 mins further to check for any such messages.
    // This is sufficiently low likelihood that this can be ignored for now.
    this.historicalMessages.sort((a, b) => this.reverseOrderer(a.id, b.id));

    // Seek backwards through history until we reach a message id <= the specified sequenceId.
    // Discard anything older (>= sequenceId) and flush out the remaining messages.
    for (let i = 0; i < this.historicalMessages.length; i++) {
      if (this.messageBeforeInclusive(this.historicalMessages[i].id, this.sequenceId)) {
        this.historicalMessages.splice(i);
        this.flush();
        this.currentState = 'success';
        return true;
      }
    }
    return false;
  }

  public flush() {
    for (let i = this.historicalMessages.length - 1; i >= 0; i--) {
      // we send historical messages through the sliding window too to catch
      // any potential out-of-orderiness by sequenceId at the attach boundary
      this.slidingWindow.next(this.historicalMessages[i]);
    }
    for (const message of this.realtimeMessages) {
      this.slidingWindow.next(message);
    }
    this.historicalMessages = [];
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
