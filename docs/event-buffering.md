# Event Buffering

Confirmation events are delivered to the SDK as messages over [Ably channels](https://ably.com/docs/channels).

The Models SDK buffers a sliding window of confirmation events (messages) to enable short-term reordering and de-duplication.

## Buffering

By default the sliding window event buffer is off.
It can be enabled but setting the number of millisecond to buffer events for, when instantiating the library:

```typescript
const modelsClient = new ModelsClient({
    ably,
    eventBufferOptions: { bufferMs: 100 }
});
```

## Event re-ordering

Internally, the Models SDK holds a sliding window of events in a buffer. These events are ordered according to their [message ID](https://ably.com/docs/api/realtime-sdk/messages?lang=javascript#id).

By default, the events in the buffer are ordered using the `numericOtherwiseLexicographicOrderer`:

- The events will be ordered numerically if the message ID can be coerced to a number
- Otherwise, the event will be ordered lexicographically by their message ID

If you are using [`adbc`](https://github.com/ably-labs/adbc/) the message ID is set to the value of the `sequence_id` of the outbox record, which is a serial integer.

You can specify a custom ordering based on any part of the message by passing an `eventOrderer` function:

```ts
const modelsClient = new ModelsClient({
    ably,
    eventBufferOptions: { bufferMs: 100, eventOrderer: (a, b) => { ... } }
});
```

## Event expiry

The buffer is a sliding window. When an event expires from the buffer it is passed to the merge function to be merged into the confirmed state.

Because events may be re-ordered, the sliding window guarantees that when a given event expires, all events in the buffer before the expiring event will be passed to the merge
function first. This ensures the order is maintained and  means that some events may remain in the buffer for less than the `bufferMs` number of milliseconds.


## Event de-duplication

Events in the buffer are deduplicated based on message id. Later events with the same message id are discarded in favour of earlier events for that message id. Deduplication only
happens for events that are in the buffer, and not for events that have expired from the buffer.
