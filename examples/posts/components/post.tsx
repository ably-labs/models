'use client';

import { useEffect, useState } from 'react';
import { User } from '@prisma/client';
import type { Post as PostType, Author as AuthorType } from '@/lib/prisma/api';
import { AuthorProvider } from '@/context/author';
import Comments from '@/components/comments';
import { configureAbly } from '@ably-labs/react-hooks';
import { usePost } from '@/lib/hooks';
import { Event } from '@ably-labs/models';

configureAbly({ key: process.env.NEXT_PUBLIC_ABLY_API_KEY });

// compare optimistic and confirmed comment mutation events by content,
// ignoring other attributes not available on the optimistic event.
function compareComments(optimistic: Event, confirmed: Event) {
  return (
    optimistic.channel === confirmed.channel &&
    optimistic.name === confirmed.name &&
    optimistic.data?.content === confirmed.data?.content
  );
}

export default function Post({ user, post: initialPost }: { user: AuthorType, post: PostType }) {
  const [post, setPost] = useState<PostType>(initialPost);
  const model = usePost(initialPost.id);

  useEffect(() => {
    const onUpdate = (err: Error, post: PostType) => {
      console.log('subscribe: ', err, post);
      if (err) {
        console.error(err);
        return;
      }
      setPost(post!);
    };
    if (!model) return;
    model.subscribe(onUpdate);
    return () => {
      model.unsubscribe(onUpdate);
    };
  });

  async function onAdd(author: User, postId: number, content: string) {
    if (!model) return;
    const [result, update, confirmation] = await model.mutations.addComment.$expect(
      [{ channel: 'comments', name: 'add', data: { author, content } }],
      compareComments,
    )(author, postId, content);
    console.log('onAdd:', result);
    await update;
    console.log('onAdd: optimistically updated');
    await confirmation;
    console.log('onAdd: confirmed');
  }

  async function onEdit(id: number, content: string) {
    if (!model) return;
    const [result, update, confirmation] = await model.mutations.editComment.$expect(
      [{ channel: 'comments', name: 'edit', data: { id, content } }],
      compareComments,
    )(id, content);
    console.log('onEdit:', result);
    await update;
    console.log('onEdit: optimistically updated');
    await confirmation;
    console.log('onEdit: confirmed');
  }

  async function onDelete(id: number) {
    if (!model) return;
    const [result, update, confirmation] = await model.mutations.deleteComment.$expect(
      [{ channel: 'comments', name: 'delete', data: { id } }],
      compareComments,
    )(id);
    console.log('onDelete:', result);
    await update;
    console.log('onDelete: optimistically updated');
    await confirmation;
    console.log('onDelete: confirmed');
  }

  return (
    <AuthorProvider author={user}>
      <main className="relative flex min-h-screen flex-col items-center justify-center">
        <h1 className="pt-4 pb-8 bg-gradient-to-br from-black via-[#171717] to-[#575757] bg-clip-text text-center text-xl font-medium tracking-tight text-transparent md:text-4xl">
          {post.title}
        </h1>
        <div className="space-y-1 mb-8">
          <p className="font-normal text-gray-500 leading-none">{post.content}</p>
        </div>
        <Comments
          postId={post.id}
          comments={post.comments}
          onEdit={onEdit}
          onAdd={onAdd}
          onDelete={onDelete}
        ></Comments>
      </main>
    </AuthorProvider>
  );
}
