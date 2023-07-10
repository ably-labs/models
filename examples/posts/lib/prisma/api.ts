import prisma from ".";

export async function getPosts() {
	return await prisma.post.findMany({
    include: {
      comments: true,
    },
  });
}

export async function getPost(id: number) {
  return await prisma.post.findUniqueOrThrow({
    where: { id },
    include: {
      comments: {
        include: {
          author: true,
        },
      },
    },
  });
}
