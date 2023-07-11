import { NextRequest, NextResponse } from 'next/server'
import type { Comment } from '@prisma/client';
import prisma from '@/lib/prisma';

async function updateComment(id: number, content: string): Promise<Comment> {
	await prisma.comment.findUniqueOrThrow({ where: { id } });
	const comment = await prisma.comment.update({
		where: { id },
		data: { content },
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
