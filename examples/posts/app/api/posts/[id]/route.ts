import { NextRequest, NextResponse } from 'next/server'
import type { Post } from '@prisma/client';
import prisma from '@/lib/prisma';

async function getPost(id: number): Promise<Post> {
	const post = await prisma.post.findUniqueOrThrow({
		where: { id },
		include: { comments: { include: { author: true } } },
	});
	return post;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
	try {
		let id: number;
		try {
			id = Number(params.id);
		} catch (error) {
			return NextResponse.json({ message: 'failed to read :id url parameter', error }, { status: 400 });
		}
		const data = await getPost(id);
		return NextResponse.json({ data });
	} catch (error) {
		return NextResponse.json({ message: 'failed to get post', error }, { status: 500 });
	}
}
