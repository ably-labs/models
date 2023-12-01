'use server';

import { Comment, User, sql } from '@/data';
import { Issue } from '../Table';
import { ProjectType } from '..';
import { CommentData } from './Comment';

export const fetchDrawerData = async () => {
  const data = await sql.begin(async (sql) => {
    const users: User[] = await sql`SELECT id, first_name, last_name, color, slug FROM users`;
    const projects: ProjectType[] = await sql`SELECT id, name, color FROM projects`;

    return { users, projects };
  });
  return data;
};

export const fetchIssueById = async (id: number) => {
  const data = await sql.begin(async (sql) => {
    const issues: Issue[] = await sql`
            SELECT
              i.id,
              i.name,
              i.due_date,
              i.status,
              i.owner_id,
              i.story_points,
              i.description,
              u.first_name as owner_first_name,
              u.last_name as owner_last_name,
              u.color as owner_color
            FROM issues i
              LEFT OUTER JOIN users u
              ON u.id = i.owner_id
            WHERE i.id = ${id}
          `;

    const comments: CommentData[] = await sql`
      SELECT 
        c.id, c.content, c.updated_at, u.last_name, u.first_name, u.color
      FROM comments c
        LEFT OUTER JOIN users u
        ON u.id = c.user_id 
      WHERE issue_id = ${id}`;

    return { issue: issues[0], comments };
  });
  return data;
};
