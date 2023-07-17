import * as runtime from '@prisma/client/runtime/library';
import { Prisma, Comment, PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";

export async function getPosts() {
  return await prisma.post.findMany({
    include: {
      comments: true,
    },
  });
}

export type PostWithComments = Prisma.PromiseReturnType<typeof getPost>;
export type CommentsWithAuthor = Prisma.PromiseReturnType<typeof getPost>['comments'];
export type CommentWithAuthor = PostWithComments['comments'][number];
export type TxClient = Omit<PrismaClient, runtime.ITXClientDenyList>;

export async function getPost(id: number) {
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

export async function addComment(tx: TxClient, postId: number, authorId: number, content: string): Promise<Prisma.OutboxCreateInput> {
  const comment = await tx.comment.create({
    data: { postId, authorId, content },
    include: { author: true },
  });
  return { channel: 'comments', name: 'add', data: comment, headers: { postId: comment.postId } };
}

export async function editComment(tx: TxClient, id: number, content: string): Promise<Prisma.OutboxCreateInput> {
  await tx.comment.findUniqueOrThrow({ where: { id } });
  const comment = await tx.comment.update({
    where: { id },
    data: { content },
    include: { author: true },
  });
  return { channel: 'comments', name: 'edit', data: comment, headers: { postId: comment.postId } };
}

export async function deleteComment(tx: TxClient, id: number): Promise<Prisma.OutboxCreateInput> {
  const comment = await tx.comment.delete({
    where: { id },
  });
  return { channel: 'comments', name: 'delete', data: { id }, headers: { postId: comment.postId } };
}

export async function withOutboxWrite(op: (tx: TxClient, ...args: any[]) => Promise<Prisma.OutboxCreateInput>, ...args: any[]) {
  return await prisma.$transaction(async (tx) => {
    const { channel, name, data, headers } = await op(tx, ...args);
    await tx.outbox.create({
      data: { channel, name, data, headers },
    });
  });
}
