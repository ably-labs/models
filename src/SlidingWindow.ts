import { Types as AblyTypes } from 'ably';

export default class SlidingWindow {
  // TODO: do I need to make this threadsafe somehow?
  private messages: AblyTypes.Message[] = [];

  constructor(private readonly windowSizeMs: number, private onExpire: (message: AblyTypes.Message) => void) {}

  public addMessage(message: AblyTypes.Message) {
    if (this.windowSizeMs == 0) {
      this.onExpire(message);
      return;
    }

    this.messages.push(message);
    this.messages.sort((a, b) => {
      if (a.id < b.id) {
        return -1;
      }

      if (a.id == b.id) {
        return 0;
      }

      return 1;
    });

    setTimeout(() => {
      this.expire(message);
    }, this.windowSizeMs);
  }

  private expire(message: AblyTypes.Message) {
    const idx = this.messages.indexOf(message);

    if (idx == -1) {
      return;
    }

    this.messages.splice(0, idx + 1).forEach((msg) => {
      this.onExpire(msg);
    });
  }
}
