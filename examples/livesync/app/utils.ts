import { ProjectType } from '@/components';
import { sql } from '@/data';
import { Issue } from '@/components';

export const fetchProjects = async () => {
  const projects: ProjectType[] = await sql`SELECT * FROM projects`;
  return projects;
};

export const fetchProjectBySlug = async (slug: string) => {
  const projectWithIssues = await sql.begin(async (sql) => {
    const projects: ProjectType[] = await sql`SELECT * FROM projects WHERE slug = ${slug}`;
    const issues: Issue[] = await sql`
      SELECT
        i.id,
        i.slug,
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
    `;

    return {
      ...projects[0],
      issues: Array.from(issues),
    };
  });
  return projectWithIssues;
};
