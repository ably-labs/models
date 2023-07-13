-- CreateTable
CREATE TABLE "nodes" (
    "id" TEXT NOT NULL,
    "expiry" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" SERIAL NOT NULL,
    "channel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB,
    "headers" JSONB,
    "locked_by" TEXT,
    "lock_expiry" TIMESTAMP(6),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

