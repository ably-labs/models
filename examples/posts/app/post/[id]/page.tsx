import { Suspense } from 'react';
import { getPost, getRandomUser } from '@/lib/prisma/api';
import Post from '@/components/post';
import PostPlaceholder from '@/components/post-placeholder';

export default async function Page({ params }: { params: { id: number } }) {
  const id = Number(params.id);
  const post = await getPost(id);
  const user = await getRandomUser();
  return (
    <Suspense fallback={<PostPlaceholder />}>
      <Post
        user={user}
        post={post}
      />
    </Suspense>
  );
}
