'use client';

import { useContext } from 'react';
import type { Prisma } from '@prisma/client';
import { getPost } from '@/lib/prisma/api';
import { UserContext } from '@/context/user';
import NewComment from '@/components/new-comment';
import Comment from '@/components/comment';

type postWithComments = Prisma.PromiseReturnType<typeof getPost>;

type CommentsProps = {
	postId: number,
	comments: postWithComments['comments'],
	onChange: (cs: postWithComments['comments']) => void,
};

export default function Comments({ postId, comments, onChange }: CommentsProps) {
	const user = useContext(UserContext);

	async function addComment(content: string) {	
		const response = await fetch('/api/comments', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				authorId: user?.id,
				postId,
				content,
			}),
		});
	
		if (!response.ok) {
			throw new Error(`POST /api/comments: ${response.status} ${JSON.stringify(await response.json())}`);
		}

		const data = await response.json();
		console.log(data);
	}

	async function editComment(id: number, content: string) {
		const response = await fetch(`/api/comments/${id}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				content,
			}),
		});
	
		if (!response.ok) {
			throw new Error(`PUT /api/comments/:id: ${response.status} ${JSON.stringify(await response.json())}`);
		}

		const data = await response.json();
		console.log(data);
		// TODO update parent onChange
	}

	async function deleteComment(id: number) {
		const response = await fetch(`/api/comments/${id}`, { method: 'DELETE' });

		if (!response.ok) {
			throw new Error(`DELETE /api/comments/:id: ${response.status} ${JSON.stringify(await response.json())}`);
		}

		const data = await response.json();
		console.log(data);
	}

	return (
		<>
			<div className="divide-y divide-gray-900/5">
				{comments.map((comment, i) => <Comment key={i} comment={comment} onChange={editComment} onDelete={deleteComment} />)}
			</div>
			<NewComment addComment={addComment} />
		</>
	)
};
