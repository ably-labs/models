import { getPost } from '@/lib/prisma/api';
import Comments from './comments';

export default async function Post({ postId }: { postId: number }) {
  const id = Number(postId);
  const post = await getPost(id);
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center">
      <h1 className="pt-4 pb-8 bg-gradient-to-br from-black via-[#171717] to-[#575757] bg-clip-text text-center text-xl font-medium tracking-tight text-transparent md:text-4xl">
        {post.title}
      </h1>
      <div className="space-y-1 mb-8">
        <p className="font-normal text-gray-500 leading-none">{post.content}</p>
      </div>
      <Comments postId={postId} comments={post.comments}></Comments>
    </main>
  )
}
