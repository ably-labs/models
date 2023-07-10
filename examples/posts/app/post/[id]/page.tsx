import { Suspense } from 'react'
import Post from '@/components/post'
import PostPlaceholder from '@/components/post-placeholder'

export default async function Page({ params }: { params: { id: number } }) {
  const id = Number(params.id);
  return (
    <Suspense fallback={<PostPlaceholder />}>
      {/* @ts-expect-error Async Server Component */}
      <Post postId={id} />
    </Suspense>
  )
}
