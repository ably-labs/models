'use client';

import { useState, useContext, FormEvent } from 'react';
import Image from 'next/image';
import { UserContext } from '@/context/user';
import { DEFAULT_AVATAR_URL } from '@/lib/image';

export default function NewComment({ postId }: { postId: number }) {
	const [comment, setComment] = useState('');
	const user = useContext(UserContext);

	async function addComment(e: FormEvent) {
		e.preventDefault();
	
		const response = await fetch('/api/comments', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				authorId: user?.id,
				postId,
				content: comment
			}),
		});
	
		if (!response.ok) {
			throw new Error(`POST /api/comments: ${response.status} ${JSON.stringify(await response.json())}`);
		}

		const data = await response.json();
		console.log(data);
		setComment('');
	}

	return (
		<form className="max-w-xl mx-auto w-full" onSubmit={addComment}>
			<div className="w-full shadow-xl rounded-lg bg-gray-50">
				<div className="px-4 py-2 bg-white rounded-t-lg">
					<div className="flex items-center py-3">
						<div className="flex flex-col space-x-4 pr-3">
							<Image
								src={user?.image || DEFAULT_AVATAR_URL}
								alt={user?.username || 'avatar'}
								width={36}
								height={36}
								className="rounded-full ring-1 ring-gray-900/5"
							/>
						</div>
						<p className="text-sm font-semibold">{user?.username}</p>
					</div>
					<label htmlFor="comment" className="sr-only">Your comment</label>
					<textarea id="comment" rows={4} className="w-full px-0 text-sm text-gray-900 bg-white outline-none focus:outline-none border-0 border-transparent focus:border-transparent focus:ring-0" placeholder="Write a comment..." required
						onChange={(e) => setComment(e.target.value)}
						value={comment}
					></textarea>
				</div>
				<div className="flex items-center justify-between px-3 py-2 border-t">
					<button type="submit" className="inline-flex items-center py-2.5 px-4 text-xs font-medium text-center text-white bg-blue-700 rounded-lg focus:bg-blue-900 hover:bg-blue-800">
						Post comment
					</button>
				</div>
			</div>
		</form>
	)
}
