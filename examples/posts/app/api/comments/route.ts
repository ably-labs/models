import { NextRequest, NextResponse } from 'next/server';
import { withOutboxWrite, addComment } from '@/lib/prisma/api';

export async function POST(request: NextRequest) {
  try {
    let comment: { postId: number; authorId: number; content: string };
    try {
      comment = await request.json();
    } catch (error) {
      return NextResponse.json({ message: 'failed to read json request body', error }, { status: 400 });
    }
    const data = await withOutboxWrite(addComment, comment.postId, comment.authorId, comment.content);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('failed to add comment', error);
    return NextResponse.json({ message: 'failed to add comment', error }, { status: 500 });
  }
}
