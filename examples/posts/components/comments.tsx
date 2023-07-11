'use client';

import { getPost } from '@/lib/prisma/api';
import type { Prisma } from '@prisma/client';
import { UserProvider } from '@/context/user';
import NewComment from '@/components/new-comment';
import Comment from '@/components/comment';

type postWithComments = Prisma.PromiseReturnType<typeof getPost>;

export default function Comments({ comments, postId }: { comments: postWithComments['comments'], postId: number }) {
	return (
		<UserProvider>
			<div className="divide-y divide-gray-900/5">
				{comments.map((comment, i) => <Comment key={i} comment={comment} />)}
			</div>
			<NewComment postId={postId} />
		</UserProvider>
	)
};
