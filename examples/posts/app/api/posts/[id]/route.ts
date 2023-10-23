import { NextRequest, NextResponse } from 'next/server';
import { getPost } from '@/lib/prisma/api';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    let id: number;
    try {
      id = Number(params.id);
    } catch (error) {
      return NextResponse.json({ message: 'failed to read :id url parameter', error }, { status: 400 });
    }
    const [data, sequenceID] = await getPost(id);
    return NextResponse.json({ sequenceID, data });
  } catch (error) {
    return NextResponse.json({ message: 'failed to get post', error }, { status: 500 });
  }
}
