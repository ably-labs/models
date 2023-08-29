# Event Correlation

*Event correlation* describes how the Models SDK matches unconfirmed, optimistic events with their confirmations received from the backend.

- [Event Correlation](#event-correlation)
	- [Comparator function](#comparator-function)
	- [Custom comparator](#custom-comparator)
	- [Correlating by UUID](#correlating-by-uuid)
	- [Default Comparator](#default-comparator)

## Comparator function

Internally, the Models SDK uses a *comparator* function to compare an optimistic event with a confirmation event.

```ts
export type EventComparator = (optimistic: Event, confirmed: Event) => boolean;
```

Whenever the library receives an event from the backend, it will compare it with the pending optimistic events using this function to determine whether the event is confirming a pending optimistic event.

For example, the library exposes a simple comparator the compares events based on equality:

```ts
export const equalityComparator: EventComparator = (optimistic: Event, confirmed: Event) => {
  return (
    optimistic.channel === confirmed.channel &&
    optimistic.name === confirmed.name &&
    isEqual(optimistic.data, confirmed.data)
  );
};
```

## Custom comparator

You can specify your own comparison function to use by providing it as an option when instantiating the library:

```ts
const models = new Models({ ably }, {
	defaultComparator: myComparator,
});
```

Instead of setting a global default, you can also specify a comparator on a specific mutation:

```ts
await model.$register({
	$mutate: {
		myMutation: {
			func: myMutation,
			options: {
				comparator: myComparator,
			},
		}
	}
});
```

Or even on a specific invocation of your mutation function:

```ts
await model.mutations.myMutation.$expect({
	events: myExpectedEvents,
	options: {
		comparator: myComparator,
	},
})();
```

## Correlating by UUID

A more robust approach is to correlate events by a specific identifier on the event. To achieve this, the Models SDK always sets a `uuid` property on the expected events before they are passed to your mutation function. These events can be accessed from your mutation function via the special `context` parameter which has the following type:

```ts
export interface MutationContext {
  events: Event[];
}
```

The context is the first argument passed to your mutation functions:

```ts
async function myMutation(context: MutationContext, foo: string) {
	const result = await fetch(`/api/post`, {
    method: 'PUT',
    body: JSON.stringify({
			content,
			events: context.events, // pass the events to your backend
		}),
  });
  return result.json();
} 
```

Note that the context is provided to your mutation function automatically by the library; you do not need to provide it when invoking your mutation via `model.mutations`.

Your backend now has access to the expected events, which contain a `uuid` field. Your backend should publish it's confirmation event with a special `x-ably-models-event-uuid` field in the `extras.headers`:

```ts
channel.publish({
	name: 'myEvent',
	data: { /* ... */ },
	extras: {
		headers: {
			'x-ably-models-event-uuid': event.uuid,
		},
	},
});
```

When the Models SDK receives the confirmation event with the `x-ably-models-event-uuid` header, it will automatically correlate events using the uuid comparator:

```ts
export const uuidComparator: EventComparator = (optimistic: Event, confirmed: Event) => {
  return !!optimistic.uuid && !!confirmed.uuid && optimistic.uuid === confirmed.uuid;
};
```

## Default Comparator

If not otherwise specified, the library will use the default comparator which will compare events by `uuid` if it is available, otherwise it falls back to the equality comparator:

```ts
export const defaultComparator: EventComparator = (optimistic: Event, confirmed: Event) => {
  if (optimistic.uuid && confirmed.uuid) {
    return uuidComparator(optimistic, confirmed);
  }
  return equalityComparator(optimistic, confirmed);
};
```
