import { NextRequest, NextResponse } from 'next/server'
import type { Comment } from '@prisma/client';
import prisma from '@/lib/prisma';

async function addComment(req: AddCommentRequest): Promise<Comment> {
	const comment = await prisma.comment.create({
		data: req,
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

type AddCommentRequest = {
	postId: number,
	authorId: number,
	content: string,
}

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

export async function DELETE(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		let id: number;
		try {
			id = Number(searchParams.get('id'));
		} catch (error) {
			return NextResponse.json({ message: 'failed to read "id" query parameter', error }, { status: 400 });
		}
		const data = await deleteComment(id);
		return NextResponse.json({ data });
	} catch (error) {
		return NextResponse.json({ message: 'failed to delete comment', error }, { status: 500 });
	}
}
