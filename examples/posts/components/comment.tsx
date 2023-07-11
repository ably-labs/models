import Image from 'next/image';
import { getPost } from '@/lib/prisma/api';
import type { Prisma } from '@prisma/client';
import { DEFAULT_AVATAR_URL } from '@/lib/image';

type postWithComments = Prisma.PromiseReturnType<typeof getPost>;

export default function Comment({ comment }: { comment: postWithComments['comments'][number] }) {
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
				</div>
				<div className="space-y-1">
					<p className="font-normal leading-none">{comment.content}</p>
				</div>
			</div>
		</div>
	)
}
