# Ably Models SDK

<p align="left">
  <a href="">
    <img src="https://badgen.net/badge/development-status/alpha/yellow?icon=github" alt="Development status"   />
  </a>
  <a href="">
    <img src="https://github.com/ably-labs/models/actions/workflows/dev-ci.yml/badge.svg?branch=main" alt="CI status"   />
  </a>
</p>

---
- [Ably Models SDK](#ably-models-sdk)
  - [Overview](#overview)
  - [Development Status](#development-status)
  - [Quickstart](#quickstart)
    - [Prerequisites](#prerequisites)
    - [Installation and authentication](#installation-and-authentication)
    - [Instantiation](#instantiation)
    - [Creating a Model](#creating-a-model)
  - [Documentation and examples](#documentation-and-examples)
  - [Feedback](#feedback)

---

## Overview

The Ably Models SDK is a key component of the [LiveSync](https://ably.com/docs/products/livesync) product that lets you stream realtime updates from your database at scale to frontend clients.

![LiveSync Diagram](/docs/images/what-is-livesync.png "LiveSync Diagram")

The Models SDK is a frontend library that simplifies subscribing to the changes in data models, applying optimistic updates and merging them with confirmed updates. It is a standalone SDK built on Ably’s JavaScript SDK with full TypeScript support.

The Database Connector and Ably Channels are the other two components of LiveSync that help publish changes from your database to frontend clients.

A model represents a data model of a specific part of your frontend application. Each frontend client can have multiple data models within the same application. 

![Models SDK Diagram](/docs/images/models-diagram.png "Models SDK Diagram")


When creating a new Model using the Models SDK you provide two functions to the Model a `sync()` function and a `merge()` function:
- The `sync(`) function is used by the SDK to retrieve the current state of the data model from your backend.
- The `merge()` function is used by the SDK to merge state change events published by the Database Connector with the existing frontend state in the Model.

You can use the Models SDK as a standalone library to merge new update events with existing frontend state, but the SDK works best as part of LiveSync.

The data models as part of the Models SDK remain synchronized with the state of your database, in realtime. You can easily integrate this SDK into your project regardless of which frontend framework you use.


## Development Status

LiveSync, and the Models SDK, is in public alpha so that you can explore its capabilities. Your [feedback](https://docs.google.com/forms/d/e/1FAIpQLSd00n1uxgXWPGvMjKwMVL1UDhFKMeh3bSrP52j9AfXifoU-Pg/viewform) will help prioritize improvements and fixes for later releases. The features in this release have been built to work under real-world situations and load, and for real-world use-cases, but there may still be some rough edges in this alpha.

## Quickstart

### Prerequisites

To begin, you will need the following:

* An Ably account. You can [sign up](https://ably.com/signup) for free.
* An Ably API key. You can create API keys in an app within your [Ably account](https://ably.com/dashboard).
  * The API key needs `subscribe` [capabilities](https://ably.com/docs/auth/capabilities).

### Installation and authentication

Install the Ably JavaScript SDK and the Realtime Data Models SDK:

```sh
npm install ably @ably-labs/models
```
Though you can test your installation and authentication with [basic authentication](https://ably.com/docs/auth/basic), we strongly recommend [token authentication](https://ably.com/docs/auth/token) for in production environments.

### Instantiation

To instantiate the Realtime Data Models SDK, create an [Ably client](https://ably.com/docs/getting-started/setup) and pass it into the ModelsClient constructor:

```typescript
import ModelsClient from '@ably-labs/models';
import { Realtime } from 'ably/promises';

const ably = new Realtime.Promise({ key: 'YOUR_ABLY_API_KEY' });
const modelsClient = new ModelsClient({ ably });
```

### Creating a Model

A `Model` represents a live, observable data model supported by the database.

To create a model, you need to:

1. Define the model's data structure in the frontend application.
2. Initialize the model.
3. Update the model based on events from the backend.
4. Determine how end-users can modify the model.

```typescript
// this is the type for our model's data as represented in the frontend application
type Post = {
  id: number;
  text: string;
  comments: string[];
};

// a function used by the model to initialise with the correct data from your backend
async function sync() {
  const result = await fetch('/api/post');
  return result.json(); // e.g. { sequenceId: 1, data: { ... } }
}

// a function used by the model to merge a change event that is received and the existing model state
function merge(state: Post, event: OptimisticEvent | ConfirmedEvent) {
  return {
    ...state,
    text: event.data, // replace the previous post text field with the new value
  }
}

// a function that you might use to mutate the model data in your backend
async function updatePost(mutationId: string, content: string) {
  const result = await fetch(`/api/post`, {
    method: 'PUT',
    body: JSON.stringify({ mutationId, content }),
  });
  return result.json();
}

// create a new model instance called 'post' by passing the sync and merge functions
const model = modelsClient.models.get({
  name: 'post',
  channelName: 'models:posts',
  sync: sync,
  merge: merge,
})

// subscribe to live changes to the model data!
model.subscribe((err, post) => {
  if (err) {
    throw err;
  }
  console.log('post updated:', post);
});


// apply an optimistic update to the model
// confirmation is a promise that resolves when the optimistic update is confirmed by the backend.
// cancel is a function that can be used to cancel and rollback the optimistic update.
const [confirmation, cancel] = await model.optimistic({
    mutationId: 'my-mutation-id',
    name: 'updatePost',
    data: 'new post text',
})

// call your backend to apply the actual change
updatePost('my-mutation-id', 'new post text')

// wait for confirmation of the change from the backend
await confirmation;
```

For more information, see [usage docs](./docs/usage.md) within this repository.

## Documentation and examples

* Read the [docs on Ably website](https://ably.com/docs/products/livesync).
* Browse the [API Reference](https://sdk.ably.com/builds/ably-labs/models/main/typedoc/).
* Explore the [examples](/examples).

## Feedback

The Models SDK is currently in public alpha. [We'd love to hear your feedback](https://forms.gle/1XrVbYkhxFvUPBDd7).