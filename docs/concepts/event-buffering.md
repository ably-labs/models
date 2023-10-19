# Event Buffering

*Event buffer* describes how the Models SDK buffers a sliding window of events to enable short-term reordering and de-duplication.

## Buffering

By default the sliding window event buffer is off.
It can be enabled but setting the number of millisecond to buffer events for, when instantiating the library:

```typescript
const modelsClient = new ModelsClient({
    ably,
    eventBufferOptions: {bufferMs: 100}
});
```

## Event re-ordering

Internally, the Models SDK holds a sliding window of events. By default the events in the buffer are ordered lexicographically by their message id.
That is, smaller message ids are moved earlier in the list of messages in the buffer.

You can specify a custom ordering based on any part of the message by passing an eventOrderer function:

```ts
const modelsClient = new ModelsClient({
    ably,
    eventBufferOptions: {bufferMs: 100, eventOrderer: (a, b) => { ... }}
});
```

## Event expiry

The buffer is a sliding window. When an event expires from the buffer it is passed to the update function to be merged into the confirmed state.

Because events may be re-ordered, the sliding window guarantees that when a given event expires, all events in the buffer before the expiring event will be passed to the update
function first. This ensures the order is maintained and  means that some events may remain in the buffer for less than the `bufferMs` number of milliseconds.


## Event de-duplication

Events in the buffer are deduplicated based on message id. Later events with the same message id are discarded in favour of earlier events for that message id. Deduplication only
happens for events that are in the buffer, and not for events that have expired from the buffer.
