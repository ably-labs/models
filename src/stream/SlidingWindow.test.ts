import { it, describe, expect, vi } from 'vitest';

import SlidingWindow from './SlidingWindow.js';
import { createMessage } from '../utilities/test/messages.js';
import { timeout } from '../utilities/test/promises.js';

describe('SlidingWindow', () => {
  it('emits events immediately with no timeout', async () => {
    const onExpire = vi.fn();
    const sliding = new SlidingWindow(0, onExpire);

    const msg = createMessage(1);
    sliding.addMessage(msg);

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledWith(msg);
  });

  it('emits events after timeout', async () => {
    const onExpire = vi.fn();
    const sliding = new SlidingWindow(100, onExpire);

    const msg = createMessage(1);
    sliding.addMessage(msg);

    expect(onExpire).toHaveBeenCalledTimes(0);

    await timeout(100);

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledWith(msg);
  });

  it('reorders events in the buffer', async () => {
    const onExpire = vi.fn();
    const sliding = new SlidingWindow(1, onExpire);

    const msg2 = createMessage(2);
    const msg1 = createMessage(1);

    sliding.addMessage(msg2);
    sliding.addMessage(msg1);

    await timeout(1);

    expect(onExpire).toHaveBeenCalledTimes(2);
    expect(onExpire).toHaveBeenNthCalledWith(1, msg1);
    expect(onExpire).toHaveBeenNthCalledWith(2, msg2);
  });

  it('reorders events in the buffer with custom order', async () => {
    const onExpire = vi.fn();
    const sliding = new SlidingWindow(1, onExpire, (a, b) => {
      if (a.id < b.id) {
        return 1;
      }

      return -1;
    });

    const msg3 = createMessage(3);
    const msg2 = createMessage(2);
    const msg1 = createMessage(1);

    sliding.addMessage(msg3);
    sliding.addMessage(msg2);
    sliding.addMessage(msg1);

    await timeout(1);

    expect(onExpire).toHaveBeenCalledTimes(3);
    expect(onExpire).toHaveBeenNthCalledWith(1, msg3);
    expect(onExpire).toHaveBeenNthCalledWith(2, msg2);
    expect(onExpire).toHaveBeenNthCalledWith(3, msg1);
  });

  it('ignores expired events when reordering', async () => {
    const onExpire = vi.fn();
    const sliding = new SlidingWindow(1, onExpire);

    const msg3 = createMessage(3);
    const msg2 = createMessage(2);
    const msg1 = createMessage(1);

    // message 3 added, and expired
    sliding.addMessage(msg3);
    await timeout(1);

    // then messages 1 and 2 added, reordered, and expired
    sliding.addMessage(msg2);
    sliding.addMessage(msg1);

    await timeout(1);

    expect(onExpire).toHaveBeenCalledTimes(3);
    expect(onExpire).toHaveBeenNthCalledWith(1, msg3);
    expect(onExpire).toHaveBeenNthCalledWith(2, msg1);
    expect(onExpire).toHaveBeenNthCalledWith(3, msg2);
  });

  it('deduplicates events in the buffer', async () => {
    const onExpire = vi.fn();
    const sliding = new SlidingWindow(1, onExpire);

    const msg1a = createMessage(2);
    const msg1b = createMessage(2);

    sliding.addMessage(msg1a);
    sliding.addMessage(msg1b);

    await timeout(1);

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenNthCalledWith(1, msg1a);
  });
});
