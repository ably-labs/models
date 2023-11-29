import { ProjectType } from '@/components';
import { sql } from '@/data';

export const fetchProjects = async () => {
  const projects: ProjectType[] = await sql`SELECT * FROM projects`;
  return projects;
};
