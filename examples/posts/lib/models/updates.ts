import type { Post as PostType } from '@/lib/prisma/api';
import { UpdateFunc } from '@ably-labs/models/dist/mjs/UpdatesRegistry';

export const addComment: UpdateFunc<PostType> = async (state, event) => ({
	...state,
	comments: state.comments.concat([{ ...event.data, optimistic: !event.confirmed }]),
});

export const editComment: UpdateFunc<PostType> = async (state, event) => ({
	...state,
	comments: state.comments.map((comment) =>
		comment.id === event.data.id ? { ...comment, content: event.data.content, optimistic: !event.confirmed } : comment,
	),
});

export const deleteComment: UpdateFunc<PostType> = async (state, event) => ({
	...state,
	comments: state.comments.filter((comment) => comment.id !== event.data.id),
});
