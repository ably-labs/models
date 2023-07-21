import { NextRequest, NextResponse } from 'next/server';
import { getSession, createResponse } from '@/lib/session';
import { getRandomUser } from '@/lib/prisma/api';

export async function GET(request: NextRequest) {
  const response = new Response();
  const session = await getSession(request, response);
  if (!session.user) {
    session.user = await getRandomUser();
    await session.save();
  }
  return createResponse(response, JSON.stringify(session.user));
}
