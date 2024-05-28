import { ProjectType } from '@/components';
import { sql } from '@/data';
import { IssueType } from '@/components';

export const fetchProjects = async () => {
  try {
    const projects = await sql<ProjectType[]>`SELECT * FROM projects`;
    return projects;
  } catch (e) {
    console.error(e)
    return [];
  }
};

export const fetchProjectBySlug = async (slug: string) => {
  const projectWithIssues = await sql.begin(async (sql) => {
    const projects = await sql<ProjectType[]>`SELECT * FROM projects WHERE slug = ${slug}`;
    if (!projects.length) {
      return;
    }
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
        WHERE project_id = ${projects[0].id}
        ORDER BY i.id DESC
      `;

    return {
      ...projects[0],
      issues: Array.from(issues),
    };
  });
  return projectWithIssues;
};
