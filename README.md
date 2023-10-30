# Ably Realtime Data Models SDK

<p align="left">
  <a href="">
    <img src="https://badgen.net/badge/development-status/alpha/yellow?icon=github" alt="Development status"   />
  </a>
  <a href="">
    <img src="https://github.com/ably-labs/models/actions/workflows/dev-ci.yml/badge.svg?branch=main" alt="CI status"   />
  </a>
</p>

Build collaborative, stateful applications with the [Ably](https://ably.com) Realtime Data Models SDK. Backed by your database, you can define live, observable data models in your client applications. You can also render live changes to data from your database in realtime.

![Models SDK Diagram](/docs/images/models-diagram.png "Models SDK Diagram")

**Bring your own database**

Store the data displayed in your frontend application in any database you choose or the one you already use.

**Collaborative by default**

Concurrently render live updates made by multiple users through your database.

**Optimistic events**

Deliver a super-responsive user experience. Show changes instantly, bypassing the wait for a network round trip or your database to confirm mutations. The Realtime Data Models SDK confirms changes behind the scenes, manages rollbacks, and flags any errors or conflicts to your app.

**Backed by Ably**

The Realtime Data Models SDK uses Ably’s fast, global message distribution network to update numerous clients across different regions with the freshest database state.

---

- [Ably Realtime data models SDK](#ably-realtime-data-models-sdk)
  - [Status](#status)
  - [Overview](#overview)
    - [How it works](#how-it-works)
  - [Quickstart](#quickstart)
    - [Prerequisites](#prerequisites)
    - [Installation and authentication](#installation-and-authentication)
      - [Option 1: Using NPM (NOT YET SUPPORTED)](#option-1-using-npm-not-yet-supported)
      - [Option 2: Using a CDN (NOT YET SUPPORTED)](#option-2-using-a-cdn-not-yet-supported)
      - [Option 3: Use `npm link`](#option-3-use-npm-link)
    - [Instantiation](#instantiation)
    - [Creating a model](#creating-a-model)
  - [Further information](#further-information)
  - [Feedback](#feedback)

---

## Overview

The Realtime Data Models SDK simplifies syncing application state from the database to the client in realtime. It constantly displays changes made simultaneously by others, creating a reactive, realtime, multiplayer application experience.

The Realtime Data Models SDK is a JavaScript (TypeScript) library that enables you to create live and observable data models in your frontend application. These models remain synchronized with the realtime state of your database model. You can easily integrate this SDK into your project regardless of your frontend framework preference. To learn how to use the SDK in a React/Next.js application, see [examples](./examples/posts).

Your backend publishes mutation events to Ably. The Realtime Data Models SDK updates your frontend app's local state. You can also pair the SDK with Ably's [Database Connector](https://github.com/ably-labs/adbc) to transmit transactional change events with your database mutations.

> **Note:** Ably's realtime messaging platform integrates with the Realtime Data Models SDK to provide a fast, reliable, scalable global distribution network with seamless recovery.

## Quickstart

### Prerequisites

To begin, you will need the following:

* An Ably account. You can [sign up](https://ably.com/signup) for free.
* An Ably API key. You can create API keys in an app within your [Ably account](https://ably.com/dashboard).
  * The API key needs `subscribe` [capabilities](https://ably.com/docs/auth/capabilities).

### Installation and authentication


#### Option 1: Using NPM (NOT YET SUPPORTED)

Install the Ably JavaScript SDK and the Realtime Data Models SDK:

```sh
npm install ably @ably-labs/models
```
Though you can test your installation and authentication with [basic authentication](https://ably.com/docs/auth/basic), we strongly recommend [token authentication](https://ably.com/docs/auth/token) for in production environments.

#### Option 2: Using a CDN (NOT YET SUPPORTED)

You can use Realtime Models SDK with a CDN, such as [unpkg](https://www.unpkg.com/):

```html
<script src="https://cdn.ably.com/lib/ably.min-1.js"></script>
<script src="https://cdn.ably.com/spaces/0.0.13/iife/index.bundle.js"></script>
```
Instantiate the SDK as you would with the npm option.

#### Option 3: Use `npm link`

Clone this repository and run `npm link`:

```sh
git clone git@github.com:ably-labs/models.git
cd models
npm link
```

From your project, link to the cloned project and build it:

```sh
cd ./your/project
npm link @ably-labs/models
pushd ./node_modules/@ably-labs/models
npm run build
popd
```

You should now be able to import `@ably-labs/models` in your project.

### Instantiation

To instantiate the Realtime Data Models SDK, create an [Ably client](https://ably.com/docs/getting-started/setup) and pass it into the ModelsClient constructor:

```typescript
import ModelsClient from '@ably-labs/models';
import { Realtime } from 'ably';

const ably = new Realtime.Promise({ key: "<API-key>" });
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
  return result.json();
}

// a function used by the model to merge a change event that is received and the existing model state
async function merge(state: Post, event: OptimisticEvent | ConfirmedEvent) {
  return {
    ...state,
    text: event.data, // replace the previous post text field with the new value
  }
}

// a function that you might use to mutate the model data in your backend
async function updatePost(mutationID: string, content: string) {
  const result = await fetch(`/api/post`, {
    method: 'PUT',
    body: JSON.stringify({ mutationID, content }),
  });
  return result.json();
}

// create a new model instance called 'post' by passing the sync and merge functions
const model = modelsClient.models.get<Post>({
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
    mutationID: 'my-mutation-id',
    name: 'updatePost',
    data: 'new post text',
})

// call your backend to apply the actual change
updatePost('my-mutation-id', 'new post text')

// wait for confirmation of the change from the backend
await confirmation;
```

For more information, see [usage docs](./docs/concepts/usage.md).

## Further information

 For more information, see:

* Read the [Concepts docs](/docs/concepts/)
* Browse the [API docs](/docs/generated/index.html)
* Explore the [examples](/examples)

## Feedback

We value your input! If you've explored Ably Realtime Data Models, or even if you considered it but chose not to use it, we'd love to hear your thoughts. Kindly share your feedback through this [form](https://docs.google.com/forms/d/e/1FAIpQLSereeJrUbLRJ5g8EBFY9qglUheyB7-bmfaAq2chFpdAuZJkDA/viewform).
