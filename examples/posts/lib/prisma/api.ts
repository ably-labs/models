import { Prisma, Comment } from "@prisma/client";
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

export async function addComment(postId: number, authorId: number, content: string): Promise<Comment> {
  const comment = await prisma.comment.create({
    data: { postId, authorId, content },
    include: { author: true },
  });
  return comment;
}

export async function updateComment(id: number, content: string): Promise<Comment> {
  await prisma.comment.findUniqueOrThrow({ where: { id } });
  const comment = await prisma.comment.update({
    where: { id },
    data: { content },
    include: { author: true },
  });
  return comment;
}

export async function deleteComment(id: number): Promise<Comment> {
  const comment = await prisma.comment.delete({
    where: { id },
  });
  return comment;
}
