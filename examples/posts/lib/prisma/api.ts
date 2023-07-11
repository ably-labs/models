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

export async function getRandomUser() {
  const count = await prisma.user.count();
  return await prisma.user.findFirstOrThrow({
    skip: Math.floor(Math.random() * count),
  });
}
