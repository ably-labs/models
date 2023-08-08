import type { Post, Comment, Author } from '@/lib/prisma/api';

export async function getPost(id: number) {
  const response = await fetch(`/api/posts/${id}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`GET /api/posts/:id: ${response.status} ${JSON.stringify(await response.json())}`);
  }
  const { data } = (await response.json()) as { data: Post };
  return { data, version: 1 }; // TODO remove version requirement
}

export async function addComment(author: Author, postId: number, content: string) {
  const response = await fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorId: author.id, postId, content }),
  });
  if (!response.ok) {
    throw new Error(`POST /api/comments: ${response.status} ${JSON.stringify(await response.json())}`);
  }
  return (await response.json()) as { data: Comment };
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
  return (await response.json()) as { data: Comment };
}

export async function deleteComment(id: number) {
  const response = await fetch(`/api/comments/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`DELETE /api/comments/:id: ${response.status} ${JSON.stringify(await response.json())}`);
  }
  return await response.json();
}
