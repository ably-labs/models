import { ConfirmedEvent, OptimisticEvent } from '@ably-labs/models';
import type { Post as PostType } from '@/lib/prisma/api';
import type { Author as AuthorType } from '@/lib/prisma/api';
import { Comment } from '@/lib/prisma/api';
import cloneDeep from 'lodash/cloneDeep';

export async function addComment(mutationID: string, author: AuthorType, postId: number, content: string) {
  const response = await fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mutationID, authorId: author.id, postId, content }),
  });
  if (!response.ok) {
    throw new Error(`POST /api/comments: ${response.status} ${JSON.stringify(await response.json())}`);
  }
  return response.json();
}

export async function editComment(mutationID: string, id: number, content: string) {
  const response = await fetch(`/api/comments/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mutationID, content }),
  });
  if (!response.ok) {
    throw new Error(`PUT /api/comments/:id: ${response.status} ${JSON.stringify(await response.json())}`);
  }
  return response.json();
}

export async function deleteComment(mutationID: string, id: number) {
  const response = await fetch(`/api/comments/${id}`, { method: 'DELETE', headers: { 'x-mutation-id': mutationID } });
  if (!response.ok) {
    throw new Error(`DELETE /api/comments/:id: ${response.status} ${JSON.stringify(await response.json())}`);
  }
  return response.json();
}

export async function merge(existingState: PostType, event: OptimisticEvent | ConfirmedEvent): Promise<PostType> {
  // Optimistic and confirmed events use the same merge function logic.

  // The models function keeps track of the state before events are applied
  // to make sure the rollback of unconfirmed events works, we need to clone
  // the state here. Our state contains an array of objects so we don't use
  // the regular object spread operator.
  const state = cloneDeep(existingState);

  switch (event.name) {
    case 'addComment':
      const newComment = event.data! as Comment;
      state.comments.push(newComment);
      break;
    case 'editComment':
      const editComment = event.data! as Comment;
      const editIdx = state.comments.findIndex((c) => c.id === editComment.id);
      state.comments[editIdx] = editComment;
      break;
    case 'deleteComment':
      const { id } = event.data! as { id: number };
      const deleteIdx = state.comments.findIndex((c) => c.id === id);
      state.comments.splice(deleteIdx, 1);
      break;
    default:
      console.error('unknown event', event);
  }

  state.comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return state;
}
