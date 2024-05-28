'use server';

import { Comment, User, sql } from '@/data';
import { IssueType } from '../Table';
import { ProjectType, StatusType } from '..';
import { CommentData } from './Comment';

export const fetchDrawerData = async () => {
  const data = await sql.begin(async (sql) => {
    const users = await sql<User[]>`SELECT id, first_name, last_name, color, slug FROM users`;
    const projects = await sql<ProjectType[]>`SELECT id, name, color FROM projects ORDER BY id DESC`;

    return { users, projects };
  });
  return data;
};

export const fetchIssueById = async (id: number) => {
  const issue = await sql.begin(async (sql) => {
    const issues = await sql<IssueType[]>`
      SELECT
        i.id,
        i.name,
        i.due_date,
        i.status,
        i.owner_id,
        i.story_points,
        i.description,
        i.project_id,
        u.first_name as owner_first_name,
        u.last_name as owner_last_name,
        u.color as owner_color
      FROM issues i
        LEFT OUTER JOIN users u
        ON u.id = i.owner_id
      WHERE i.id = ${id}
    `;

    const ids = await sql`SELECT COALESCE(MAX(sequence_id), 0) FROM outbox`;

    return { data: issues[0], sequenceId: ids[0].coalesce };
  });

  return issue;
};

export const fetchComments = async (id: number) => {
  const data = await sql.begin(async (sql) => {
    const result = await sql<CommentData[]>`
      SELECT
        c.id, c.content, c.updated_at, u.last_name, u.first_name, u.color
      FROM comments c
        LEFT OUTER JOIN users u
        ON u.id = c.user_id
      WHERE issue_id = ${id}
      ORDER BY c.updated_at DESC
    `.cursor();

    const ids = await sql`SELECT COALESCE(MAX(sequence_id), 0) FROM outbox`;
    let comments: CommentData[] = [];
    for await (const [row] of result) {
      comments.push(row);
    }

    return { data: comments, sequenceId: ids[0].coalesce };
  });

  return data;
};

export const postComment = async ({
  userId,
  issueId,
  content,
  mutationId,
  updated_at,
  first_name,
  last_name,
  color,
}: {
  userId: number;
  issueId: number;
  content: string;
  mutationId: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  color: string;
}) => {
  const comment = await sql.begin(async (sql) => {
    const newComment = await sql<Comment[]>`
      INSERT INTO comments (user_id, issue_id, content, updated_at)
      VALUES (${userId}, ${issueId}, ${content}, ${updated_at})
      RETURNING *
    `;

    const data = {
      mutation_id: mutationId,
      channel: `comments:${issueId}`,
      name: 'postComment',
      data: {
        userId,
        issueId,
        content,
        updated_at,
        first_name,
        last_name,
        color,
      },
    };

    await sql`INSERT INTO outbox ${sql(data, 'mutation_id', 'channel', 'name', 'data')}`;

    return newComment;
  });

  return comment;
};

export interface UpdateIssueData {
  project_id: number;
  owner_id: number;
  status: StatusType;
  due_date: string;
  mutationId: string;
}

export const updateIssue = async (
  id: number,
  { project_id, owner_id, status, due_date, mutationId }: UpdateIssueData,
) => {
  const issue = await sql.begin(async (sql) => {
    const issue = await sql<IssueType[]>`
      UPDATE issues
      SET project_id = ${project_id}, owner_id= ${owner_id}, status=${status}, due_date = ${due_date}
      WHERE id = ${id}
      RETURNING *
    `;

    const data = {
      mutation_id: mutationId,
      channel: `issue:${id}`,
      name: 'updateIssue',
      data: {
        project_id,
        owner_id,
        status,
        due_date,
      },
    };

    await sql`INSERT INTO outbox ${sql(data, 'mutation_id', 'channel', 'name', 'data')}`;

    return issue[0];
  });

  return issue;
};

export interface UpdateInputData {
  name: string;
  value: string;
  mutationId: string;
}

export const updateIssueNameOrDescription = async (id: number, { name, value, mutationId }: UpdateInputData) => {
  const issue = await sql.begin(async (sql) => {
    const data = {
      mutation_id: mutationId,
      channel: `issue:${id}`,
      name: 'updateInput',
      data: {
        name,
        value,
      },
    };

    await sql`INSERT INTO outbox ${sql(data, 'mutation_id', 'channel', 'name', 'data')}`;

    if (name === 'description') {
      const issue = await sql<IssueType[]>`
        UPDATE issues
        SET description = ${value}
        WHERE id = ${id}
        RETURNING *
      `;
      return issue[0];
    }

    const issue = await sql<IssueType[]>`
        UPDATE issues
        SET name = ${value}
        WHERE id = ${id}
        RETURNING *
      `;

    return issue[0];
  });

  return issue;
};
