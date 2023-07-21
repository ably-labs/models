import { NextRequest, NextResponse } from 'next/server';
import type { Comment } from '@prisma/client';
import prisma from '@/lib/prisma';

async function updateComment(id: number, content: string): Promise<Comment> {
  await prisma.comment.findUniqueOrThrow({ where: { id } });
  const comment = await prisma.comment.update({
    where: { id },
    data: { content },
    include: { author: true },
  });
  return comment;
}

async function deleteComment(id: number): Promise<Comment> {
  const comment = await prisma.comment.delete({
    where: { id },
  });
  return comment;
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    let comment: { content: string };
    let id: number;
    try {
      comment = await request.json();
      id = Number(params.id);
    } catch (error) {
      return NextResponse.json({ message: 'failed to read json request body', error }, { status: 400 });
    }
    const data = await updateComment(id, comment.content);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ message: 'failed to update comment', error }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    let id: number;
    try {
      id = Number(params.id);
    } catch (error) {
      return NextResponse.json({ message: 'failed to read :id url parameter', error }, { status: 400 });
    }
    const data = await deleteComment(id);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ message: 'failed to delete comment', error }, { status: 500 });
  }
}
