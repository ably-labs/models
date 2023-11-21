import { Suspense } from 'react';

import Post from '@/components/post';
import PostPlaceholder from '@/components/post-placeholder';
import { getPost, getRandomUser } from '@/lib/prisma/api';

export default async function Page({ params }: { params: { id: number } }) {
  const id = Number(params.id);
  const [post] = await getPost(id);
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
