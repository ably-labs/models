This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Launching project in Docker

You can run everything in "production" mode in Docker by running

```bash
docker compose up -d
```

The app will be served on `localhost:3002`

## Launching project locally

You will still need to run 

```bash
docker compose up -d
```

to launch Ably DB connector and Postgres services. Feel free to disable the `app` service (lines 46-62 in `docker-compose.yml`). 

Once docker services are up, launch the Next.js app separately in dev mode with

```bash
pnpm dev
```

The app will start on [http://localhost:3000](http://localhost:3000).

**⚠️IMPORTANT⚠️:** if you're using a Postgres in our docker, before running app locally, change `ADBC_POSTGRES_CONNECTION_URI` env variable from `postgres://postgres:postgres@postgres:5432/postgres` to `postgres://postgres:postgres@localhost:5432/postgres`. The first variant is for Docker environment only.

## Populating DB with a fake data

If you're using another DB hosted elsewhere, e.g. Vercel, you can populate it with a mock data with 

```bash
pnpm seed
```