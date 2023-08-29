# Ably Realtime Data Models SDK

<p align="left">
  <a href="">
    <img src="https://badgen.net/badge/development-status/alpha/yellow?icon=github" alt="Development status"   />
  </a>
  <a href="">
    <img src="https://github.com/ably-labs/models/actions/workflows/dev-ci.yml/badge.svg?branch=main" alt="CI status"   />
  </a>
</p>

The [Ably](https://ably.com) Realtime Data Models SDK enables you to build collaborative, stateful applications by defining *live, observable data models* in your client applications, backed by your database. It allows you to render live changes to data stored in your database in realtime.

![Models SDK Diagram](/docs/images/models-diagram.png "Models SDK Diagram")

Try out a [live demo](https://models.ably.dev) of a collaborative comment thread application for an example of realtime, stateful collaboration in action.

**Bring your own database**

The data you render in your frontend application is stored in whatever backend database you choose (or are already using!)

**Collaborative by default**

Render live updates to the data made concurrently by any number of other users.

**Optimistic updates**

Create a very fast & snappy user experience by rendering changes instantly without waiting for the network round trip or for your mutations to be committed to the database. The Models SDK automatically confirms changes in the background, handles rollbacks, and surfaces errors or conflicts to your application.

**Backed by Ably**

Leverages Ably’s low-latency, global message distribution network to keep a large number of clients across multiple regions up-to-date with the latest database state.

---

- [Ably Realtime Data Models SDK](#ably-realtime-data-models-sdk)
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
    - [Creating a Model](#creating-a-model)

---

## Status

The Realtime Data Models SDK is currently under development. If you are interested in being an early adopter and providing feedback then you can [sign up](https://go.ably.com/models-early-access) for early access and are welcome to [provide us with feedback](https://go.ably.com/models-feedback).

## Overview

The Models SDK aims to make it easier to synchronise this application state from the database to the client in realtime. This allows changes made concurrently by other users or other parts of the system to be continually rendered to the user as part of a reactive, realtime, multiplayer application.

The Models SDK is a JavaScript (TypeScript) library that allows you to define live, observable data models in your frontend application that are kept up-to-date with the true state of the model in your database, in realtime. It is framework-agnostic, allowing you to integrate it with whatever frontend framework prefer (for example, see the [examples](./examples/posts) for usage in React/Next.js app).

The Models SDK consumes "mutation" events published to Ably by your backend to update the local state in your frontend apps. This library can be used in conjunction with Ably's [Database Connector](https://github.com/ably-labs/adbc), which makes it easy to reliably emit change events over Ably transactionally with mutations to your data in your database.

By integrating with Ably's realtime messaging platform, the Models SDK benefits from a low-latency, fault-tolerant, highly scalable, global distribution network and seamless connection recovery.


### How it works

For a detailed description of how the Models SDK works, see the [docs](./docs/concepts).

## Quickstart

Get started quickly using this section, or take a look at:

* Read the [Concepts docs](/docs/concepts/)
* Browse the [API docs](/docs/generated/index.html)
* Explore the [examples](/examples)

### Prerequisites

To begin, you will need the following:

* An Ably account. You can [sign up](https://ably.com/signup) for free.
* An Ably API key. You can create API keys in an app within your [Ably account](https://ably.com/dashboard).
  * The API key needs `subscribe` [capabilities](https://ably.com/docs/auth/capabilities).

You can use [basic authentication](https://ably.com/docs/auth/basic) for testing purposes, however it is strongly recommended that you use [token authentication](https://ably.com/docs/auth/token) in production environments.

### Installation and authentication


#### Option 1: Using NPM (NOT YET SUPPORTED)

Install the Ably JavaScript SDK and the Models SDK:

```sh
npm install ably @ably-labs/models
```

You can use [basic authentication](https://ably.com/docs/auth/basic) i.e. the API Key directly for testing purposes, however it is strongly recommended that you use [token authentication](https://ably.com/docs/auth/token) in production environments.

#### Option 2: Using a CDN (NOT YET SUPPORTED)

You can also use Models with a CDN, such as [unpkg](https://www.unpkg.com/):

```html
<script src="https://cdn.ably.com/lib/ably.min-1.js"></script>
<script src="https://cdn.ably.com/spaces/0.0.13/iife/index.bundle.js"></script>
```
After this, instantiate the SDK in the same way as in the NPM option above.

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

To instantiate the Models SDK, create an [Ably client](https://ably.com/docs/getting-started/setup) and pass it into the Models constructor:

```ts
import Models from '@ably-labs/models';
import { Realtime } from 'ably';

const ably = new Realtime.Promise({ key: "<API-key>" });
const models = new Models({ ably });
```

### Creating a Model

A `Model` is a single instance of a live, observable data model backed by your database.

You create a model by defining:

- The shape of the model data in your frontend application
- How the model is initialised
- How the model is updated when *events* are received from your backend
- How the model can be *mutated* by the user

```ts
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

// a function used by the model to update the model state when a change event is received
async function onPostUpdated(state: Post, event: OptimisticEvent | ConfirmedEvent) {
  return {
    ...state,
    text: event.data, // replace the previous post text field with the new value
  }
}

// a function that the user can call to mutate the model data in your backend
async function updatePost(context: MutationContext, content: string) {
  const result = await fetch(`/api/post`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  return result.json();
}

// create a new model instance called 'post'
const model = models.Model<Post, { updatePost: typeof updatePost }>('post');

// register the functions we defined above
await model.$register({
  $sync: sync,
  $update: {
    'posts': {
      'update': onPostUpdated,
    },
  },
  $mutate: {
    updatePost,
  },
});

// subscribe to live changes to the model data!
model.subscribe((err, post) => {
  if (err) {
    throw err;
  }
  console.log('post updated:', post);
});

// mutate the post
const [result, confirmation] = await model.mutations.updatePost('new value');

// wait for confirmation of the change from the backend
await confirmation;
```

For a more in depth guide, see the [usage docs](./docs/concepts/usage.md).

