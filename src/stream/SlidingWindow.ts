import { Types as AblyTypes } from 'ably';

import type { EventOrderer } from '../types/mutations';

export default class SlidingWindow {
  private messages: AblyTypes.Message[] = [];

  constructor(
    private readonly windowSizeMs: number,
    private onExpire: (message: AblyTypes.Message) => void,
    private readonly eventOrderer: EventOrderer = defaultOrderLexicoId,
  ) {}

  public addMessage(message: AblyTypes.Message) {
    if (this.windowSizeMs === 0) {
      this.onExpire(message);
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

  private expire(message: AblyTypes.Message) {
    const idx = this.messages.indexOf(message);

    if (idx === -1) {
      return;
    }

    this.messages.splice(0, idx + 1).forEach((msg) => {
      this.onExpire(msg);
    });
  }
}

function defaultOrderLexicoId(a: AblyTypes.Message, b: AblyTypes.Message): number {
  if (a.id < b.id) {
    return -1;
  }

  if (a.id === b.id) {
    return 0;
  }

  return 1;
}
