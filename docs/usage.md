# Usage

- [Usage](#usage)
  - [Model](#model)
  - [Sync Function](#sync-function)
  - [Merge Functions](#merge-functions)
  - [Optimistic events](#optimistic-events)
  - [Subscriptions](#subscriptions)
  - [Model Lifecycle](#model-lifecycle)

## Model

A `Model` is a single instance of a live, observable data model backed by your database.

You can represent your data model in your frontend application however you like; it is completely decoupled from the way you represent the data in your database!

To instantiate a `Model` you must provide a unique name to identify the model in your application and the name of an [Ably channel](https://ably.com/docs/channels) over which updates to the model state will be broadcast from your backend. If a model with that name does not yet exist, it will be created; otherwise, the existing instance will be returned.

```ts
const model = modelsClient.models.get({
  name: 'myPost',
  channelName: 'post:123',
  sync: /* ... */,
  merge: /* ... */,
})
```

You also need to pass some *registrations* which link up the model to your application code, which are described below.

## Sync Function

> A *sync function* tells your model how to initialise with the latest data.

To initialise the data in your model, we need to provide it with a *sync function*. The sync function can be any function that optionally accepts some params and returns a promise with the latest state of your data model along with a sequence ID.

```ts
type Post = {
  id: number;
  text: string;
  comments: string[];
};

async function sync() {
  return {
    sequenceId: '1',
    data: {
      id: 1,
      text: 'My Post',
      comments: [{ id: 1, text: 'My Comment' }],
    },
  }
}
```

> **Note:** The sequence ID is used to resume from the correct point in the change event stream to apply the correct set of change events to the returned snapshot version of the model state.
>
> For more information, see [Replay](./replay.md).

Typically, you would implement this as a function which retrieves the model state from your backend over the network.

The params allow the model to be parameterised, or paginated. For example, we might have a REST HTTP API endpoint which returns the data for our post.

```ts
async function sync(id: number, page: number) {
  const result = await fetch(`/api/post/${id}?page=${page}`);
  return result.json(); // e.g. { sequenceId: '1', data: { id: 1, text: "Hello World", comments: [] } }
}

const model = modelsClient.models.get({
  sync,
  /* other registrations */
})
```

The model will invoke the sync function at the start of its lifecycle to initialise your model state.

Additionally, this function will be invoked if the model needs to re-synchronise at any point, for example after an extended period of network disconnectivity. When the SDK needs to automatically re-synchronise it will use the params from the last call to the sync function.

The params are optional, and can be left out by omitting them from the sync function definition, and leaving out the second type parameter when getting a model.

## Merge Functions

> *Merge functions* tell your model how to calculate the next version of the data when a mutation event is received.

When changes occur to your data model in your backend, your backend is expected to emit *events* which describe the result of the mutation that occurred. The Models SDK will consume these events and apply them to its local copy of the model state to produce the next updated version. The way the next state is calculated is expressed as a *merge function*, which has the following type:

```ts
export type MergeFunc<T> = (state: T, event: OptimisticEvent | ConfirmedEvent) => T;
```

i.e. it is a function that accepts the previous model state and the event and returns the next model state.

> An event can be either *optimistic* or *confirmed*. Events that come from your backend are always treated as *confirmed* events as they describe a the result of a mutation to the data which has been accepted by your backend. Soon, we will see how the Models SDK can also emit local *optimistic* events which describe mutations that have happened locally but have not yet been confirmed by your backend.

Confirmed events are emitted from your backend over Ably *[channels](https://ably.com/docs/channels)*. A model can consume events from any number of Ably channels.

> **Note**
> Ably's [Database Connector](https://github.com/ably-labs/adbc) makes it easy to emit change events over Ably transactionally with mutations to your data in your database.

A model is associated with a *channel name*; the model will invoke the merge function for all events it receives on the associated channel.

## Optimistic events

The Models SDK supports *optimistic updates* which allows you to render the latest changes to your data model before they have been confirmed by the backend. This makes for a really quick and snappy user experience where all updates feel instantaneous!

> *Optimistic events* allow you to make local changes to your data optimistically that you expect you backend will later confirm or reject.

To apply optimistic changes to your model, you can call with `.optimistic(...)` method on your model passing the optimistic event. This optimistic event will be passed to your merge function to be optimistically included in the local model state.

The optimistic event should include a `mutationId` that can be used to correlate the optimistic events with its confirmation emitted by your backend.

You are also responsible for applying the change to your backend directly. You should pass the `mutationId` that you included on your event to yor backend so that you can emit a confirmation event with that mutation ID from your backend.

> For more information, see [Event Correlation](./event-correlation.md).

```ts
// your method for applying the change to your backed
async function updatePost(mutationId: string, content: string) {
  const result = await fetch(`/api/post`, {
    method: 'PUT',
    body: JSON.stringify({ mutationId, content }),
  });
  return result.json();
}

// optimistically apply the changes to the model
const mutationId = uuid();
const [confirmation, cancel] = await model.optimistic({
    mutationId,
    name: 'updatePost',
    data: 'new post text',
})

// apply the changes in your backend
updatePost(mutationId, 'new post text')
```

The model returns a promise that resolves to two values from the `.optimsitic(...)` function.

1. A `confirmation` promise that resolves when the optimistic update has been confirmed by that backend (or rejects if it is rejected or times out).
2. A `cancel` function that allows you to rollback the optimistic update, for example if your backend HTTP API call failed.

## Subscriptions

Once our registrations are complete, we can now subscribe to our data model to get updated whenever the data changes in realtime:

```ts
model.subscribe((err, post) => {
  if (err) {
    throw err;
  }
  console.log('post updated:', post);
})
```

By default this is an *optimistic* subscription, so the subscription callback will be invoked whenever the optimistic state of the model changes (as well as when confirmed changes are made).

If we only want to subscribe to confirmed changes, we can provide some options when we subscribe:

```ts
model.subscribe((err, post) => { /* ... */ }, { optimistic: false });
```

## Model Lifecycle

There may be cases where we want to pause or resume a model. We can do this using the methods available on the model instance:

```ts
await model.pause();
// model paused: new events will not be processed and subscription callbacks will no longer be invoked
await model.resume();
// processing of events has resumed and new changes will be made available to subscribers
```

When we're done with the model, we can dispose of it to release all its resources:

```ts
await model.dispose();
// model disposed and can no longer be used
```

It is also possible to hook into the model lifecycle by listening directly for model state change events on the model instance (which itself is an event emitter):

```ts
model.on('paused', () => { /* model paused*/ });
model.on('ready', () => { /* model resumed */ });
model.on('disposed', () => { /* model disposed */ });
```
