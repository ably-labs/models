import { it, describe, expect, vi, beforeEach } from 'vitest';

import { SequenceResumer, SlidingWindow, OrderedSequenceResumer } from './Middleware.js';
import { createMessage } from '../utilities/test/messages.js';
import { timeout } from '../utilities/test/promises.js';

describe('SequenceResumer', () => {
  let middleware: SequenceResumer;

  beforeEach(() => {
    middleware = new SequenceResumer('100');
  });

  it('does not emit messages before sequenceID', () => {
    const callback = vi.fn();
    middleware.subscribe(callback);

    middleware.next(createMessage(50));
    expect(callback).not.toHaveBeenCalled();
  });

  it('emits an error for out-of-order messages', () => {
    const callback = vi.fn();
    middleware.subscribe(callback);

    middleware.next(createMessage(150));
    middleware.next(createMessage(120));

    expect(callback).toHaveBeenCalledWith(expect.any(Error), null); // TODO error type
  });

  it('emits an error if we have not crossed the boundary', () => {
    const callback = vi.fn();
    middleware.subscribe(callback);

    middleware.next(createMessage(101));
    expect(callback).toHaveBeenCalledWith(expect.any(Error), null);

    middleware.next(createMessage(102));
    expect(callback).toHaveBeenCalledWith(expect.any(Error), null);
  });

  it('emits messages after starting on the boundary', () => {
    const callback = vi.fn();
    middleware.subscribe(callback);

    middleware.next(createMessage(100));
    expect(callback).toHaveBeenCalledTimes(0);

    middleware.next(createMessage(101));
    expect(callback).toHaveBeenCalledWith(null, createMessage(101));
  });

  it('emits messages after crossing the boundary', () => {
    const callback = vi.fn();
    middleware.subscribe(callback);

    middleware.next(createMessage(99));
    expect(callback).toHaveBeenCalledTimes(0);

    middleware.next(createMessage(100));
    expect(callback).toHaveBeenCalledTimes(0);

    middleware.next(createMessage(101));
    expect(callback).toHaveBeenCalledWith(null, createMessage(101));
  });

  it('emits messages after crossing the boundary with sparse sequence', () => {
    const callback = vi.fn();
    middleware.subscribe(callback);

    middleware.next(createMessage(99));
    expect(callback).toHaveBeenCalledTimes(0);

    middleware.next(createMessage(101));
    expect(callback).toHaveBeenCalledWith(null, createMessage(101));
  });

  it('does not emit messages after unsubscribing individually', () => {
    const callback = vi.fn();
    middleware.subscribe(callback);

    middleware.next(createMessage(100));
    expect(callback).toHaveBeenCalledTimes(0);

    middleware.next(createMessage(101));
    expect(callback).toHaveBeenNthCalledWith(1, null, createMessage(101));

    middleware.unsubscribe(callback);

    middleware.next(createMessage(102));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not emit messages after unsubscribing all', () => {
    const callback = vi.fn();
    middleware.subscribe(callback);

    middleware.next(createMessage(100));
    expect(callback).toHaveBeenCalledTimes(0);

    middleware.next(createMessage(101));
    expect(callback).toHaveBeenNthCalledWith(1, null, createMessage(101));

    middleware.unsubscribeAll();

    middleware.next(createMessage(102));
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('SlidingWindow', () => {
  it('emits events immediately with no timeout', async () => {
    const subscription = vi.fn();
    const sliding = new SlidingWindow(0);
    sliding.subscribe(subscription);

    const msg = createMessage(1);
    sliding.next(msg);

    expect(subscription).toHaveBeenCalledTimes(1);
    expect(subscription).toHaveBeenCalledWith(null, msg);
  });

  it('emits events after timeout', async () => {
    const subscription = vi.fn();
    const sliding = new SlidingWindow(100);
    sliding.subscribe(subscription);

    const msg = createMessage(1);
    sliding.next(msg);

    expect(subscription).toHaveBeenCalledTimes(0);

    await timeout(100);

    expect(subscription).toHaveBeenCalledTimes(1);
    expect(subscription).toHaveBeenCalledWith(null, msg);
  });

  it('reorders events in the buffer', async () => {
    const subscription = vi.fn();
    const sliding = new SlidingWindow(1);
    sliding.subscribe(subscription);

    const msg2 = createMessage(2);
    const msg1 = createMessage(1);

    sliding.next(msg2);
    sliding.next(msg1);

    await timeout(1);

    expect(subscription).toHaveBeenCalledTimes(2);
    expect(subscription).toHaveBeenNthCalledWith(1, null, msg1);
    expect(subscription).toHaveBeenNthCalledWith(2, null, msg2);
  });

  it('reorders events in the buffer with custom order', async () => {
    const subscription = vi.fn();
    const sliding = new SlidingWindow(1, (a, b) => {
      if (a.id < b.id) {
        return 1;
      }

      return -1;
    });
    sliding.subscribe(subscription);

    const msg3 = createMessage(3);
    const msg2 = createMessage(2);
    const msg1 = createMessage(1);

    sliding.next(msg3);
    sliding.next(msg2);
    sliding.next(msg1);

    await timeout(1);

    expect(subscription).toHaveBeenCalledTimes(3);
    expect(subscription).toHaveBeenNthCalledWith(1, null, msg3);
    expect(subscription).toHaveBeenNthCalledWith(2, null, msg2);
    expect(subscription).toHaveBeenNthCalledWith(3, null, msg1);
  });

  it('ignores expired events when reordering', async () => {
    const subscription = vi.fn();
    const sliding = new SlidingWindow(1);
    sliding.subscribe(subscription);

    const msg3 = createMessage(3);
    const msg2 = createMessage(2);
    const msg1 = createMessage(1);

    // message 3 added, and expired
    sliding.next(msg3);
    await timeout(1);

    // then messages 1 and 2 added, reordered, and expired
    sliding.next(msg2);
    sliding.next(msg1);

    await timeout(1);

    expect(subscription).toHaveBeenCalledTimes(3);
    expect(subscription).toHaveBeenNthCalledWith(1, null, msg3);
    expect(subscription).toHaveBeenNthCalledWith(2, null, msg1);
    expect(subscription).toHaveBeenNthCalledWith(3, null, msg2);
  });

  it('deduplicates events in the buffer', async () => {
    const subscription = vi.fn();
    const sliding = new SlidingWindow(1);
    sliding.subscribe(subscription);

    const msg1a = createMessage(2);
    const msg1b = createMessage(2);

    sliding.next(msg1a);
    sliding.next(msg1b);

    await timeout(1);

    expect(subscription).toHaveBeenCalledTimes(1);
    expect(subscription).toHaveBeenNthCalledWith(1, null, msg1a);
  });

  it('does not emit events after unsubscribing individually', async () => {
    const subscription = vi.fn();
    const sliding = new SlidingWindow(0);
    sliding.subscribe(subscription);

    const msg = createMessage(1);
    sliding.next(msg);

    expect(subscription).toHaveBeenCalledTimes(1);
    expect(subscription).toHaveBeenCalledWith(null, msg);

    sliding.unsubscribe(subscription);
    sliding.next(createMessage(2));
    expect(subscription).toHaveBeenCalledTimes(1);
  });

  it('does not emit events after unsubscribing all', async () => {
    const subscription = vi.fn();
    const sliding = new SlidingWindow(0);
    sliding.subscribe(subscription);

    const msg = createMessage(1);
    sliding.next(msg);

    expect(subscription).toHaveBeenCalledTimes(1);
    expect(subscription).toHaveBeenCalledWith(null, msg);

    sliding.unsubscribeAll();
    sliding.next(createMessage(2));
    expect(subscription).toHaveBeenCalledTimes(1);
  });
});

describe('OrderedSequenceResumer', () => {
  it('should reorder messages within the sliding window and emit those after the boundary', async () => {
    const orderedSequenceResumer = new OrderedSequenceResumer('100', 100);

    let receivedMessages: string[] = [];
    orderedSequenceResumer.subscribe((err, message) => {
      if (!err && message) receivedMessages.push(message.id);
    });

    orderedSequenceResumer.next(createMessage(101));
    orderedSequenceResumer.next(createMessage(100));
    orderedSequenceResumer.next(createMessage(99));
    orderedSequenceResumer.next(createMessage(103));
    orderedSequenceResumer.next(createMessage(102));

    await timeout(100);

    expect(receivedMessages).toEqual(['101', '102', '103']);
  });

  it('should handle errors when messages are out of order outside window bounds', async () => {
    const orderedSequenceResumer = new OrderedSequenceResumer('100', 0 /* 0-width window */);

    let errors: Error[] = [];
    orderedSequenceResumer.subscribe((err) => {
      if (err) errors.push(err);
    });

    orderedSequenceResumer.next(createMessage(100));
    orderedSequenceResumer.next(createMessage(99));
    orderedSequenceResumer.next(createMessage(102));
    orderedSequenceResumer.next(createMessage(101));

    await timeout(0);

    expect(errors).toHaveLength(1); // only emit the first error
    expect(errors[0].message).toMatch(/out-of-sequence message received/);
  });
});
