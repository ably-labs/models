import { ConfirmedEvent, OptimisticEvent } from '@ably-labs/models';
import type { Post as PostType } from '@/lib/prisma/api';
import type { Author as AuthorType } from '@/lib/prisma/api';
import { Comment } from '@/lib/prisma/api';

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

export async function merge(state: PostType, event: OptimisticEvent | ConfirmedEvent): Promise<PostType> {
  if (event.confirmed) {
    // Our implementation returns the entire post state
    // inside the confirmed event, this stops state drift
    // between the frontend and backend.
    console.log(event.data);
    return event.data as PostType;
  }

  // Optimistically include the new state
  switch (event.name) {
    case 'add':
      const newComment = event.data! as Comment;
      state.comments.push(newComment);
      break;
    case 'edit':
      const editComment = event.data! as Comment;
      const editIdx = state.comments.findIndex((c) => c.id === editComment.id);
      state.comments[editIdx] = editComment;
      break;
    case 'delete':
      const { id } = event.data! as { id: number };
      const deleteIdx = state.comments.findIndex((c) => c.id === id);
      state.comments.splice(deleteIdx, 1);
      break;
  }

  return state;
}
