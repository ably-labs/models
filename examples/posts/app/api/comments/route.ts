import { NextRequest, NextResponse } from 'next/server';
import type { Comment } from '@prisma/client';
import prisma from '@/lib/prisma';

async function addComment(req: AddCommentRequest): Promise<Comment> {
  const comment = await prisma.comment.create({
    data: req,
    include: { author: true },
  });
  return comment;
}

type AddCommentRequest = {
  postId: number;
  authorId: number;
  content: string;
};

export async function POST(request: NextRequest) {
  try {
    let comment: AddCommentRequest;
    try {
      comment = await request.json();
    } catch (error) {
      return NextResponse.json({ message: 'failed to read json request body', error }, { status: 400 });
    }
    const data = await addComment(comment);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ message: 'failed to add comment', error }, { status: 500 });
  }
}
