import type { Author as AuthorType } from '@/lib/prisma/api';

export async function addComment(author: AuthorType, postId: number, content: string) {
  const response = await fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorId: author.id, postId, content }),
  });
  if (!response.ok) {
    throw new Error(`POST /api/comments: ${response.status} ${JSON.stringify(await response.json())}`);
  }
  return response.json();
}

export async function editComment(id: number, content: string) {
  const response = await fetch(`/api/comments/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    throw new Error(`PUT /api/comments/:id: ${response.status} ${JSON.stringify(await response.json())}`);
  }
  return response.json();
}

export async function deleteComment(id: number) {
  const response = await fetch(`/api/comments/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`DELETE /api/comments/:id: ${response.status} ${JSON.stringify(await response.json())}`);
  }
  return response.json();
}

export type Mutations = {
  addComment: (...args: Parameters<typeof addComment>) => Promise<void>;
  editComment: (...args: Parameters<typeof editComment>) => Promise<void>;
  deleteComment: (...args: Parameters<typeof deleteComment>) => Promise<void>;
};
