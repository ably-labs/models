import { Types } from 'ably';
import shuffle from 'lodash/shuffle.js';
import { it, describe, expect, vi } from 'vitest';

import { SlidingWindow, OrderedHistoryResumer, lexicographicOrderer } from './Middleware.js';
import { timeout } from '../utilities/promises.js';
import { createMessage } from '../utilities/test/messages.js';

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
      if (a < b) {
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

describe('OrderedHistoryResumer', () => {
  it('emits messages after the boundary from shuffled page', () => {
    const sequenceID = 3;
    const middleware = new OrderedHistoryResumer(`${sequenceID}`, 0);
    const subscription = vi.fn();
    middleware.subscribe(subscription);

    // construct history page newest to oldest
    let history: Types.Message[] = [
      createMessage(5),
      createMessage(4),
      createMessage(3),
      createMessage(2),
      createMessage(1),
    ];
    // shuffle as the middleware should be resilient to some out-of-orderiness by sequenceID due to CGO
    expect(middleware.addHistoricalMessages(shuffle(history))).toBe(true);
    expect(() => middleware.addHistoricalMessages(history)).toThrowError(
      'can only add historical messages while in seeking state',
    );

    expect(subscription).toHaveBeenCalledTimes(2);
    expect(subscription).toHaveBeenNthCalledWith(1, null, history[1]);
    expect(subscription).toHaveBeenNthCalledWith(2, null, history[0]);
  });

  it('orders numerically', () => {
    const sequenceID = 0;
    const middleware = new OrderedHistoryResumer(`${sequenceID}`, 0);
    const subscription = vi.fn();
    middleware.subscribe(subscription);

    // construct history page newest to oldest
    let history: Types.Message[] = [createMessage(10), createMessage(2), createMessage(1), createMessage(0)];
    // shuffle as the middleware should be resilient to some out-of-orderiness by sequenceID due to CGO
    expect(middleware.addHistoricalMessages(shuffle(history))).toBe(true);
    expect(() => middleware.addHistoricalMessages(history)).toThrowError(
      'can only add historical messages while in seeking state',
    );

    expect(subscription).toHaveBeenCalledTimes(3);
    expect(subscription).toHaveBeenNthCalledWith(1, null, history[2]);
    expect(subscription).toHaveBeenNthCalledWith(2, null, history[1]);
    expect(subscription).toHaveBeenNthCalledWith(3, null, history[0]);
  });

  it('orders lexicographically', () => {
    const sequenceID = 0;
    const middleware = new OrderedHistoryResumer(`${sequenceID}`, 0, lexicographicOrderer);
    const subscription = vi.fn();
    middleware.subscribe(subscription);

    // construct history page newest to oldest
    let history: Types.Message[] = [createMessage(10), createMessage(2), createMessage(1), createMessage(0)];
    // shuffle as the middleware should be resilient to some out-of-orderiness by sequenceID due to CGO
    expect(middleware.addHistoricalMessages(shuffle(history))).toBe(true);
    expect(() => middleware.addHistoricalMessages(history)).toThrowError(
      'can only add historical messages while in seeking state',
    );

    expect(subscription).toHaveBeenCalledTimes(3);
    expect(subscription).toHaveBeenNthCalledWith(1, null, history[2]);
    expect(subscription).toHaveBeenNthCalledWith(2, null, history[0]);
    expect(subscription).toHaveBeenNthCalledWith(3, null, history[1]);
  });

  it('emits messages after the boundary with sparse sequence', () => {
    const sequenceID = 3;
    const middleware = new OrderedHistoryResumer(`${sequenceID}`, 0);
    const subscription = vi.fn();
    middleware.subscribe(subscription);

    // construct history page newest to oldest
    let history: Types.Message[] = [
      createMessage(7),
      createMessage(5),
      createMessage(4),
      createMessage(2),
      createMessage(1),
    ];
    expect(middleware.addHistoricalMessages(shuffle(history))).toBe(true);

    expect(subscription).toHaveBeenCalledTimes(3);
    expect(subscription).toHaveBeenNthCalledWith(1, null, history[2]);
    expect(subscription).toHaveBeenNthCalledWith(2, null, history[1]);
    expect(subscription).toHaveBeenNthCalledWith(3, null, history[0]);
  });

  it('emits messages after the boundary from multiple pages', () => {
    const sequenceID = 3;
    const middleware = new OrderedHistoryResumer(`${sequenceID}`, 0);
    const subscription = vi.fn();
    middleware.subscribe(subscription);

    let history: Types.Message[] = [
      createMessage(5),
      createMessage(4),
      createMessage(3),
      createMessage(2),
      createMessage(1),
    ];
    const page1 = history.slice(0, history.length / 2);
    const page2 = history.slice(history.length / 2 + 1);

    expect(middleware.addHistoricalMessages(shuffle(page1))).toBe(false);
    expect(middleware.addHistoricalMessages(shuffle(page2))).toBe(true);

    expect(subscription).toHaveBeenCalledTimes(2);
    expect(subscription).toHaveBeenNthCalledWith(1, null, history[1]);
    expect(subscription).toHaveBeenNthCalledWith(2, null, history[0]);
  });

  it('flushes when empty history page reached', () => {
    const sequenceID = 0; // out of reach
    const middleware = new OrderedHistoryResumer(`${sequenceID}`, 0);
    const subscription = vi.fn();
    middleware.subscribe(subscription);

    let history: Types.Message[] = [
      createMessage(5),
      createMessage(4),
      createMessage(3),
      createMessage(2),
      createMessage(1),
    ];
    const page1 = history;
    const page2 = [];

    expect(middleware.addHistoricalMessages(shuffle(page1))).toBe(false);
    expect(middleware.addHistoricalMessages(shuffle(page2))).toBe(true);

    expect(subscription).toHaveBeenCalledTimes(5);
    expect(subscription).toHaveBeenNthCalledWith(1, null, history[4]);
    expect(subscription).toHaveBeenNthCalledWith(2, null, history[3]);
    expect(subscription).toHaveBeenNthCalledWith(3, null, history[2]);
    expect(subscription).toHaveBeenNthCalledWith(4, null, history[1]);
    expect(subscription).toHaveBeenNthCalledWith(5, null, history[0]);
  });

  it('merges historical messages with live messages', () => {
    const sequenceID = 3;
    const middleware = new OrderedHistoryResumer(`${sequenceID}`, 0);
    const subscription = vi.fn();
    middleware.subscribe(subscription);

    let live: Types.Message[] = [createMessage(6), createMessage(7)];
    middleware.addLiveMessages(live[0]);
    middleware.addLiveMessages(live[1]);

    let history: Types.Message[] = [
      createMessage(5),
      createMessage(4),
      createMessage(3),
      createMessage(2),
      createMessage(1),
    ];
    expect(middleware.addHistoricalMessages(shuffle(history))).toBe(true);

    expect(subscription).toHaveBeenCalledTimes(4);
    expect(subscription).toHaveBeenNthCalledWith(1, null, history[1]);
    expect(subscription).toHaveBeenNthCalledWith(2, null, history[0]);
    expect(subscription).toHaveBeenNthCalledWith(3, null, live[0]);
    expect(subscription).toHaveBeenNthCalledWith(4, null, live[1]);
  });

  it('merges multiple pages of historical messages with live messages', () => {
    const sequenceID = 3;
    const middleware = new OrderedHistoryResumer(`${sequenceID}`, 0);
    const subscription = vi.fn();
    middleware.subscribe(subscription);

    let live: Types.Message[] = [createMessage(6), createMessage(7), createMessage(8), createMessage(9)];
    middleware.addLiveMessages(live[0]);
    middleware.addLiveMessages(live[1]);

    let history: Types.Message[] = [
      createMessage(5),
      createMessage(4),
      createMessage(3),
      createMessage(2),
      createMessage(1),
    ];
    const page1 = history.slice(0, history.length / 2);
    const page2 = history.slice(history.length / 2 + 1);

    expect(middleware.addHistoricalMessages(shuffle(page1))).toBe(false);

    middleware.addLiveMessages(live[2]);
    middleware.addLiveMessages(live[3]);

    expect(middleware.addHistoricalMessages(shuffle(page2))).toBe(true);

    expect(subscription).toHaveBeenCalledTimes(6);
    expect(subscription).toHaveBeenNthCalledWith(1, null, history[1]);
    expect(subscription).toHaveBeenNthCalledWith(2, null, history[0]);
    expect(subscription).toHaveBeenNthCalledWith(3, null, live[0]);
    expect(subscription).toHaveBeenNthCalledWith(4, null, live[1]);
    expect(subscription).toHaveBeenNthCalledWith(5, null, live[2]);
    expect(subscription).toHaveBeenNthCalledWith(6, null, live[3]);
  });
});
