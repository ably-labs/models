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

export async function getPost(id: number): Promise<Post> {
  return await prisma.post.findUniqueOrThrow({
    where: { id },
    include: {
      comments: {
        include: {
          author: true,
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
  postId: number,
  authorId: number,
  content: string,
): Promise<Prisma.outboxCreateInput> {
  const comment = await tx.comment.create({
    data: { postId, authorId, content },
    include: { author: true },
  });
  return { channel: 'comments', name: 'add', data: comment, headers: { postId: comment.postId } };
}

export async function editComment(tx: TxClient, id: number, content: string): Promise<Prisma.outboxCreateInput> {
  await tx.comment.findUniqueOrThrow({ where: { id } });
  const comment = await tx.comment.update({
    where: { id },
    data: { content },
    include: { author: true },
  });
  return { channel: 'comments', name: 'edit', data: comment, headers: { postId: comment.postId } };
}

export async function deleteComment(tx: TxClient, id: number): Promise<Prisma.outboxCreateInput> {
  const comment = await tx.comment.delete({
    where: { id },
  });
  return { channel: 'comments', name: 'delete', data: { id }, headers: { postId: comment.postId } };
}

export async function withOutboxWrite(
  op: (tx: TxClient, ...args: any[]) => Promise<Prisma.outboxCreateInput>,
  ...args: any[]
) {
  return await prisma.$transaction(async (tx) => {
    const { channel, name, data, headers } = await op(tx, ...args);
    await tx.outbox.create({
      data: { channel, name, data, headers },
    });
  });
}
