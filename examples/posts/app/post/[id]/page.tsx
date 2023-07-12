import { Suspense } from 'react';
import { getPost } from '@/lib/prisma/api';
import Post from '@/components/post';
import PostPlaceholder from '@/components/post-placeholder';

export default async function Page({ params }: { params: { id: number } }) {
  const id = Number(params.id);
  const post = await getPost(id);
  return (
    <Suspense fallback={<PostPlaceholder />}>
      <Post post={post} />
    </Suspense>
  )
}
