import prisma from '../lib/prisma'
import fetch from 'cross-fetch';

type randomUser = {
  email: string;
  picture: {
    thumbnail: string;
  };
}

type results = {
  results: randomUser[];
};

async function main() {
  const users = [];
  for (let i = 0; i < 10; i++) {
    const user = (await (await fetch('https://randomuser.me/api')).json() as results).results[0];
    users.push({
      username: user.email,
      image: user.picture.thumbnail,
    })
  }
  console.log('creating users:', users);
  await Promise.all(users.map(user => prisma.user.upsert({
    where: { username: user.username },
    update: {},
    create: { ...user },
  })));

  const posts = [{
    title: 'Introduction to Realtime Applications with Ably',
    content: 'In this post, we will learn about the basics of Ably and how it can be used to build powerful realtime applications.',
    comments: [
      'This introduction to Ably was really helpful. I now understand the power of realtime applications!',
      'I\'ve been wondering about scaling realtime applications. This post provides great insights from practical experiences.',
    ],
  }];
  console.log('creating posts:', posts);
  await Promise.all(posts.map(post => prisma.post.create({
    data: {
      title: post.title,
      content: post.content,
      comments: {
        create: post.comments.map(comment => ({
          content: comment,
          authorId: Math.floor(Math.random() * users.length),
        })),
      },
    },
  })));
}
main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
