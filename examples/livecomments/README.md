# LiveComments Example app

An example application with posts and comments that uses the Models SDK and [Ably Database Connector](https://github.com/ably-labs/adbc).

The app uses Next.js, and [Prisma](https://prisma.io).

## Getting started

First, set up environment variables by copying them from the template:

```
cp env.example env.local
```

Update your `env.local` file with the following:

```
POSTGRES_URL="postgres://postgres:postgres@localhost:5432/postgres"
POSTGRES_PRISMA_URL="postgres://postgres:postgres@localhost:5432/postgres"
POSTGRES_URL_NON_POOLING="postgres://postgres:postgres@localhost:5432/postgres"
POSTGRES_USER=postgres
POSTGRES_HOST=localhost
POSTGRES_PASSWORD=postgres
POSTGRES_DATABASE=postgres
SESSION_SECRET=<SOME_SECRET>
NEXT_PUBLIC_ABLY_API_KEY=<YOUR_ABLY_API_KEY>
```

- Replace `<SOME_SECRET>` with some random string.
- Replace `<YOUR_ABLY_API_KEY>` with your Ably API Key

> **Note**
> You can get a free Ably API Key at [https://ably.com](https://ably.com)

Export the environment variables in your shell session:

```bash
export $(grep -s -v "^#" env.local | xargs) # export environment variables
```

Now spin up a PostgreSQL database and an instance of `adbc` which publishes change events written to the outbox table over Ably channels.

```bash
docker compose up --build -d
```

Now we can create the necessary tables in the database and create some seed data:

```bash
pnpm install # first install dependencies
pnpm run db 
```

You can now start the example app:

```bash
pnpm run dev
```

Open the app on [localhost:3000](http://localhost:3000).

Navigate to a post and try adding, editing and removing comments from multiple tabs and see the changes reflected to all users in realtime!
