# Event Correlation

*Event correlation* describes how the Models SDK matches unconfirmed, optimistic events with their confirmations received from the backend.

## Mutation IDs and comparator function

Optimistic and confirmed events are correlated using the mutation ID.
The mutation ID is set on the optimistic event when it is created, and is expected to be set on the confirmed event emitted by your backend.

That means it's your responsibility to pass the mutation ID to your backend when making the mutation, so that it can be included in the confirmed event.

Whenever the library receives an event from the backend, it will compare it with the pending optimistic events using this function to determine whether the event is confirming a pending optimistic event.

Your backend should publish it's confirmation event with a special `x-ably-models-event-uuid` field in the `extras.headers`:

```ts
channel.publish({
	name: 'myEvent',
	data: { /* ... */ },
	extras: {
		headers: {
			'x-ably-models-event-uuid': mutationID,
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

