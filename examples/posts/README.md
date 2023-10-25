# Posts Example app

An example application with posts and comments that uses the Models SDK and [adbc database connector](https://github.com/ably-labs/adbc).

The app uses Next.js, and [Prisma](https://prisma.io).

## Getting started

We recommend you run the database and connector from the adbc repo.
This will create a postgres database, the connector, and the tables that the connector requires.

```bash
cd adbc/
export ADBC_ABLY_KEY=<my-api-key>
docker-compose up
```

Next, apply the prisma migrations:
```bash
## These env vars are used by the following prisma commands
## so we set them here. They use the default login created by adbc's docker-compose
export POSTGRES_URL_NON_POOLING=postgresql://postgres:postgres@localhost:5432/postgres
export POSTGRES_PRISMA_URL=postgresql://postgres:postgres@localhost:5432/postgres

## The adbc startup already auto-created these tables for us. So we tell prisma that
## the 0_init migration is already applied. If you didn't set auto_create=true in adbc
## then skip this step.
npx prisma migrate resolve --applied 0_init

## Apply the remaining migrations
npx prisma migrate deploy

## Generate some sample data we can use in the app
## Running this command more than once will create multiple posts, but they will all have the same content.
npx prisma db seed
```

Setup the environment variables that the server and client need, add the following to `.env.local`
```bash
# .env.local file content
POSTGRES_URL_NON_POOLING=postgresql://postgres:postgres@localhost:5432/postgres
POSTGRES_PRISMA_URL=postgresql://postgres:postgres@localhost:5432/postgres
SESSION_SECRET=
NEXT_PUBLIC_ABLY_API_KEY=<my-api-key>
```

You can now start the example app:
```bash
export ABLY_KEY=<my-api-key>
npm run dev
```

Open the app on [localhost:3000](http://localhost:3000)

