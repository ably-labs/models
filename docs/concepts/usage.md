
# Usage

- [Usage](#usage)
	- [Model](#model)
	- [Sync Function](#sync-function)
	- [Update Functions](#update-functions)
	- [Mutation Functions](#mutation-functions)
	- [Subscriptions](#subscriptions)
	- [Model Lifecycle](#model-lifecycle)

## Model

A `Model` is a single instance of a live, observable data model backed by your database.

You can represent your data model in your frontend application however you like; it is completely decoupled from the way you represent the data in your database!

To instantiate a `Model`, give it a unique name to identify the model in your application. If a model with that name does not yet exist, it will be created; otherwise, the existing instance will be returned.

```ts
type Post = {
  id: number;
  text: string;
  comments: string[];
};
```

Note that we pass in the shape of our data model (`Post`) as a type parameter.

> In addition, we pass in a type parameter that defines the set of available [*mutations*](#mutation-functions) on the data model, described below.

Once your model is instantiated, we need to make some *registrations* which link up the model to your application code:

```ts
await model.$register({
	$sync: /* ... */,
	$update: /* ... */,
	$mutate: /* ... */,
});
```

Let's take a look at each of these registrations in turn.

## Sync Function

> A *sync function* tells your model how to initialise with the latest data.

To initialise the data in your model, we need to provide it with a *sync function*. The sync function has the following type:

```ts
type SyncFunc<T> = () => Promise<T>;
```

i.e it can be any function that returns a promise with the latest state of your data model. Typically, you would implement this as a function which retrieves the model state from your backend over the network. For example, we might have a REST HTTP API endpoint which returns the data for our post:

```ts
async function sync() {
  const result = await fetch('/api/post');
  return result.json();
}

await model.$register({
  $sync: sync,
  /* other registrations */
});
```

The model will invoke this function at the start of its lifecycle to initialise your model state. Additionally, this function will be invoked if the model needs to re-synchronise at any point, for example after an extended period of network disconnectivity.

## Update Functions

> *Update functions* tell your model how to calculate the next version of the data when a mutation event occurs.

When changes occur to your data model in your backend, your backend is expected to emit *events* which describe the mutation that occurred. The Models SDK will consume these events and apply them to its local copy of the model state to produce the next updated version. The way the next state is calculated is expressed as an *update function*, which has the following type:

```ts
type UpdateFunc<T> = (state: T, event: OptimisticEvent | ConfirmedEvent) => Promise<T>;
```

i.e. it is a function that accepts the previous model state and the event and returns the next model state.

> An event can be either *optimistic* or *confirmed*. Events that come from your backend are always treated as *confirmed* events as they describe a mutation to the data which has been accepted by your backend. Soon, we will see how the Models SDK can also emit local *optimistic* events which describe mutations that have happened locally but have not yet been confirmed by your backend.

Confirmed events are emitted from your backend over Ably *[channels](https://ably.com/docs/channels)*. A model can consume events from any number of Ably channels.

> **Note**
> Ably's [Database Connector](https://github.com/ably-labs/adbc) makes it easy to emit change events over Ably transactionally with mutations to your data in your database.

An update function is associated with a *channel name* and an *event name*; the model will invoke the update function whenever it receives an event with that name on the associated channel.

For example, we might define an update function which runs when we get an `update` event on the `posts` channel, where the payload is the new value of the post's `text` field:

```ts
async function onPostUpdated(state, event) {
  return {
    ...state,
    text: event.data, // replace the previous post text field with the new value
  }
}

await model.$register({
  // update functions are registered on the model using a
  // mapping of channel_name -> event_name -> update_function
  $update: {
    'posts': {
      'update': onPostUpdated,
    },
  },
  /* other registrations */
});
```

## Mutation Functions

> *Mutation functions* allow you to make changes to your data in your backend and tell your model what changes to expect.

In order to make changes to your data, you can register a set of *mutations* on the data model. It is a simple function which accepts any input arguments you like and returns a promise of a given type.

Typically, you would implement this as a function which updates the model state in your backend over the network. For example, we might have a REST HTTP API endpoint which updates the data for our post:

```ts
async function updatePost(context: MutationContext, content: string) {
  const result = await fetch(`/api/post`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  return result.json();
}

await model.$register({
  $mutate: {
    updatePost,
  },
  /* other registrations */
});
```

> Note that the first `context` argument gives your mutation function access to the expected events that were passed to the mutation function when it was invoked. See [Event Correlation](./event-correlation.md).

The backend API endpoint would then update the post data in the database and emit a confirmation event, which would be received and processed by our `onPostUpdated` update function described [above](#update-functions).

It is possible to configure options on each mutation, for example to set a specific timeout within which the model will expect the mutation to be confirmed:

```ts
await model.$register({
  $mutate: {
    updatePost: {
      func: updatePost,
      options: { timeout: 5000 },
    }
  },
  /* other registrations */
});
```

You can now invoke the registered mutation using the `mutations` handle on the model:

```ts
const result = await model.mutations.updatePost('new value');
```

The Models SDK supports *optimistic updates* which allows you to render the latest changes to your data model before they have been confirmed by the backend. This makes for a really quick and snappy user experience where all updated feel instantaneous! To achieve this, when you invoke a mutation you can specify a set of *optimistic events* which will be applied to your data model immediately:

```ts
const [result, confirmed] = await model.mutations.updatePost.$expect([
  { channel: 'post', name: 'update', text: 'new value' },	// optimistic event
])('new value');

await confirmed;
// optimistic update was confirmed by the backend!
```

When a mutation is invoked in this way, the mutation returns not only the result from calling the mutation function but also an additional promise that will resolve when the expected events are ultimately confirmed by the backend.

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
await model.$pause();
// model paused: new events will not be processed and subscription callbacks will no longer be invoked
await model.$resume();
// processing of events has resumed and new changes will be made available to subscribers
```

When we're done with the model, we can dispose of it to release all its resources:

```ts
await model.$dispose();
// model disposed and can no longer be used
```

It is also possible to hook into the model lifecycle by listening directly for model state change events on the model instance (which itself is an event emitter):

```ts
model.on('paused', () => { /* model paused*/ });
model.on('ready', () => { /* model resumed */ });
model.on('disposed', () => { /* model disposed */ });
```
