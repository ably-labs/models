import * as runtime from '@prisma/client/runtime/library';
import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';

export type Author = {
  id: number;
  username: string;
  image: string;
};

export type Comment = {
  id: number;
  postId: number;
  author: Author;
  content: string;
  optimistic?: boolean;
  createdAt: Date;
};

export type Post = {
  id: number;
  title: string;
  content: string;
  comments: Comment[];
};

export async function getPosts(): Promise<Post[]> {
  return await prisma.post.findMany({
    include: {
      comments: {
        include: {
          author: true,
        },
      },
    },
  });
}

export async function getPost(id: number): Promise<[Post, number]> {
  return await prisma.$transaction(async (tx) => {
    const post = await getPostTx(tx, id);

    type r = { nextval: number };
    const [{ nextval }] = await tx.$queryRaw<r[]>`SELECT nextval('outbox_sequence_id_seq')::integer`;

    return [post, nextval];
  });
}

async function getPostTx(tx: TxClient, id: number) {
  return await tx.post.findUniqueOrThrow({
    where: { id },
    include: {
      comments: {
        include: {
          author: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  });
}

export async function getRandomUser() {
  const count = await prisma.user.count();
  return await prisma.user.findFirstOrThrow({
    skip: Math.floor(Math.random() * count),
  });
}

export type TxClient = Omit<PrismaClient, runtime.ITXClientDenyList>;

export async function addComment(
  tx: TxClient,
  mutationID: string,
  postId: number,
  authorId: number,
  content: string,
): Promise<Prisma.outboxCreateInput> {
  const comment = await tx.comment.create({
    data: { postId, authorId, content },
    include: { author: true },
  });

  return { mutation_id: mutationID, channel: `post:${comment.postId}`, name: 'addComment', data: comment, headers: {} };
}

export async function editComment(
  tx: TxClient,
  mutationID: string,
  id: number,
  content: string,
): Promise<Prisma.outboxCreateInput> {
  await tx.comment.findUniqueOrThrow({ where: { id } });
  const comment = await tx.comment.update({
    where: { id },
    data: { content },
    include: { author: true },
  });

  return {
    mutation_id: mutationID,
    channel: `post:${comment.postId}`,
    name: 'editComment',
    data: comment,
    headers: {},
  };
}

export async function deleteComment(tx: TxClient, mutationID: string, id: number): Promise<Prisma.outboxCreateInput> {
  const comment = await tx.comment.delete({
    where: { id },
  });

  return {
    mutation_id: mutationID,
    channel: `post:${comment.postId}`,
    name: 'deleteComment',
    data: comment,
    headers: {},
  };
}

export async function withOutboxWrite(
  op: (tx: TxClient, ...args: any[]) => Promise<Prisma.outboxCreateInput>,
  ...args: any[]
) {
  return await prisma.$transaction(async (tx) => {
    const { mutation_id, channel, name, data, headers } = await op(tx, ...args);
    await tx.outbox.create({
      data: { mutation_id, channel, name, data, headers },
    });
  });
}
