'use client';

import { Suspense, useContext } from 'react';
import { UserContext } from '@/context/user';
import NewComment from '@/components/new-comment';
import Comment from '@/components/comment';
import CommentPlaceholder from '@/components/comment-placeholder';
import type { CommentsWithAuthor, CommentWithAuthor } from '@/lib/prisma/api';

type CommentsProps = {
	postId: number,
	comments: CommentsWithAuthor,
	onChange: (cs: CommentsWithAuthor) => void,
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

		const { data } = await response.json() as ({ data: CommentWithAuthor });
		onChange(comments.concat([data]));
	}

	function editComment(id: number, content: string) {
		onChange(comments.map(comment => comment.id === id ? ({ ...comment, content }) : comment));
	}

	function deleteComment(id: number) {
		onChange(comments.filter(comment => comment.id !== id));
	}

	return (
		<>
			<div className="divide-y divide-gray-900/5">
				{comments.map((comment, i) => <Suspense key={comment.id} fallback={<CommentPlaceholder />}>
					<Comment comment={comment} onEdit={content => editComment(comment.id, content)} onDelete={() => deleteComment(comment.id)} />
				</Suspense>)}
			</div>
			<NewComment addComment={addComment} />
		</>
	)
};
