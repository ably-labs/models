'use client';

import { useContext } from 'react';
import Image from 'next/image';
import type { Prisma } from '@prisma/client';
import { TrashIcon } from '@heroicons/react/24/solid';
import { getPost } from '@/lib/prisma/api';
import { DEFAULT_AVATAR_URL } from '@/lib/image';
import { UserContext } from '@/context/user';

type postWithComments = Prisma.PromiseReturnType<typeof getPost>;

export default function Comment({ comment }: { comment: postWithComments['comments'][number] }) {
	const user = useContext(UserContext);

	async function deleteComment() {
		const response = await fetch(`/api/comments?id=${comment.id}`, { method: 'DELETE' });
	
		if (!response.ok) {
			throw new Error(`DELETE /api/comments: ${response.status} ${JSON.stringify(await response.json())}`);
		}

		const data = await response.json();
		console.log(data);
	}

	return (
		<div className="bg-white/30 px-4 pb-4 mb-2 shadow-xl ring-1 ring-gray-900/5 rounded-lg backdrop-blur-lg max-w-xl mx-auto w-full">
			<div className="flex flex-col">
				<div className="flex items-center py-3">
					<div className="flex flex-col space-x-4 pr-3">
						<Image
							src={comment.author.image || DEFAULT_AVATAR_URL}
							alt={comment.author.username}
							width={36}
							height={36}
							className="rounded-full ring-1 ring-gray-900/5"
						/>
					</div>
					<p className="text-sm font-semibold">{comment.author.username}</p>
					<p className="ml-auto text-sm text-gray-500">TODO date</p>
					{comment.authorId === user?.id && <TrashIcon className="ml-4 h-6 w-6 text-red-300 hover:text-red-500 hover:cursor-pointer" onClick={() => deleteComment()} />}
				</div>
				<div className="space-y-1">
					<p className="font-normal leading-none">{comment.content}</p>
				</div>
			</div>
		</div>
	)
}
