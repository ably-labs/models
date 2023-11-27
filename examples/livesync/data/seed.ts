import chalk from 'chalk';
import sql from './db';
import { createComments, createIssues, projects, users } from './fakeData';

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
        id SERIAL PRIMARY KEY,
        slug VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        color VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`;
    const projectsRows = await sql`INSERT INTO projects ${sql(
      projects,
      'slug',
      'name',
      'description',
      'color',
    )} RETURNING id`;

    console.log(chalk.greenBright('🗄️  Created and seeded projects table'));

    await sql`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(255) UNIQUE NOT NULL,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        color VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`;
    const usersRows = await sql`INSERT INTO users ${sql(
      users,
      'slug',
      'first_name',
      'last_name',
      'email',
      'color',
      'title',
    )} RETURNING id`;

    console.log(chalk.greenBright('💁‍♀️ Created and seeded users table'));

    await sql`
      CREATE TABLE issues (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        due_date TIMESTAMP NOT NULL DEFAULT NOW(),
        status statuses NOT NULL,
        owner_id SERIAL REFERENCES users,
        story_points INTEGER NOT NULL,
        description TEXT NOT NULL,
        project_id SERIAL NOT NULL REFERENCES projects,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`;
    const issues = createIssues(usersRows, projectsRows);
    const issuesRows = await sql`INSERT INTO issues ${sql(
      issues,
      'slug',
      'name',
      'due_date',
      'status',
      'owner_id',
      'story_points',
      'description',
      'project_id',
    )} RETURNING id`;

    console.log(chalk.greenBright('🎟️  Created and seeded users table'));

    await sql`
      CREATE TABLE comments (
        id SERIAL PRIMARY KEY,
        issue_id SERIAL REFERENCES issues,
        user_id SERIAL REFERENCES users,
        content TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`;

    const comments = createComments(issuesRows, usersRows);
    const commentsRows = await sql`INSERT INTO comments ${sql(
      comments,
      'issue_id',
      'user_id',
      'content',
    )} RETURNING id`;

    console.log(chalk.greenBright('💬 Created and seeded users table'));

    return [projectsRows, usersRows, issuesRows, commentsRows];
  });

  console.log(chalk.bold.greenBright('Done! 🎉'));

  process.exit(0);
};

seedData();
