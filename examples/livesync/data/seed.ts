import chalk from 'chalk';
import sql from './db';
import { comments, issues, projects, users } from './fakeData';

const seedData = async () => {
  await sql.begin(async (sql) => {
    await sql`DROP TABLE IF EXISTS comments CASCADE`;
    await sql`DROP TABLE IF EXISTS issues CASCADE`;
    await sql`DROP TABLE IF EXISTS users CASCADE`;
    await sql`DROP TABLE IF EXISTS projects CASCADE`;
    await sql`DROP TYPE IF EXISTS statuses CASCADE`;

    console.log(chalk.greenBright('💣 Dropped all the tables and types'));

    await sql`CREATE TYPE statuses AS ENUM ('done', 'inprogress', 'blocked', 'todo')`;

    await sql`
      CREATE TABLE projects (
        id UUID PRIMARY KEY,
        slug VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        color VARCHAR(255) NOT NULL
      )`;
    const projectsRows = await sql`INSERT INTO projects ${sql(
      projects,
      'id',
      'slug',
      'name',
      'description',
      'color',
    )} RETURNING *`;

    console.log(chalk.greenBright('🗄️  Created and seeded projects table'));

    await sql`
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        slug VARCHAR(255) UNIQUE NOT NULL,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        color VARCHAR(255) NOT NULL,
        date_added DATE NOT NULL,
        title VARCHAR(255) NOT NULL
      )`;
    const usersRows = await sql`INSERT INTO users ${sql(
      users,
      'id',
      'slug',
      'first_name',
      'last_name',
      'email',
      'color',
      'date_added',
      'title',
    )} RETURNING *`;

    console.log(chalk.greenBright('💁‍♀️ Created and seeded users table'));

    await sql`
      CREATE TABLE issues (
        id UUID PRIMARY KEY,
        slug VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        due_date DATE NOT NULL,
        status statuses NOT NULL,
        owner UUID REFERENCES users,
        story_points INTEGER NOT NULL,
        description TEXT NOT NULL,
        project_id UUID NOT NULL REFERENCES projects
      )`;
    const issuesRows = await sql`INSERT INTO issues ${sql(
      issues,
      'id',
      'slug',
      'name',
      'due_date',
      'status',
      'owner',
      'story_points',
      'description',
      'project_id',
    )} RETURNING *`;

    console.log(chalk.greenBright('🎟️  Created and seeded users table'));

    await sql`
      CREATE TABLE comments (
        id UUID PRIMARY KEY,
        issue UUID REFERENCES issues,
        user_id UUID REFERENCES users,
        created_on DATE NOT NULL,
        content TEXT NOT NULL
      )`;
    const commentsRows = await sql`INSERT INTO comments ${sql(
      comments,
      'id',
      'issue',
      'user_id',
      'created_on',
      'content',
    )} RETURNING *`;

    console.log(chalk.greenBright('💬 Created and seeded users table'));

    return [projectsRows, usersRows, issuesRows, commentsRows];
  });

  console.log(chalk.bold.greenBright('Done! 🎉'));

  process.exit(0);
};

seedData();
