import CommentPlaceholder from "./comment-placeholder"

export default function PostPlaceholder() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center">
      <h1 className="pt-4 pb-8 bg-gradient-to-br from-black via-[#171717] to-[#575757] bg-clip-text text-center text-xl font-medium tracking-tight text-transparent md:text-4xl">
        Loading post...
      </h1>
      <div className="space-y-1 mb-8">
        <p className="font-normal text-gray-500 leading-none">...</p>
      </div>
      <div className="w-full divide-y divide-gray-900/5">
        {[...Array(3)].map((_, i) => <CommentPlaceholder key={i} />)}
      </div>
    </main>
  )
}
