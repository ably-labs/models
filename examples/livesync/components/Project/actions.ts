'use server';

import { sql } from '@/data';
import { IssueType } from '../Table';

export const fetchIssues = async (id: number) => {
	const issues = await sql<IssueType[]>`
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
        WHERE project_id = ${id}
        ORDER BY i.id DESC
      `;

	return Array.from(issues);
};
