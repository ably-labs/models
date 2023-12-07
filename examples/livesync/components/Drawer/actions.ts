'use server';

import { Comment, User, sql } from '@/data';
import { Issue } from '../Table';
import { ProjectType, StatusType } from '..';
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

  return issues[0];
};

export const fetchComments = async (id: number) => {
  const comments: CommentData[] = await sql`
      SELECT 
        c.id, c.content, c.updated_at, u.last_name, u.first_name, u.color
      FROM comments c
        LEFT OUTER JOIN users u
        ON u.id = c.user_id 
      WHERE issue_id = ${id}
      ORDER BY c.updated_at DESC
    `;

  return comments;
};

export const postComment = async ({
  userId,
  issueId,
  content,
}: {
  userId: number;
  issueId: number;
  content: string;
}) => {
  const newComment: Comment[] = await sql`
    INSERT INTO comments (user_id, issue_id, content)
    VALUES (${userId}, ${issueId}, ${content})
    RETURNING *
  `;
  return newComment[0];
};

export interface UpdateIssueData {
  project_id: number;
  owner_id: number;
  status: StatusType;
  due_date: string;
}

export const updateIssue = async (id: number, { project_id, owner_id, status, due_date }: UpdateIssueData) => {
  const issue: Issue[] = await sql`
    UPDATE issues
    SET project_id = ${project_id}, owner_id= ${owner_id}, status=${status}, due_date = ${due_date}
    WHERE id = ${id}
    RETURNING * 
  `;

  return issue[0];
};
