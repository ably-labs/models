import { redirect } from 'next/navigation';
import { fetchProjects } from './utils';

export async function GET() {
  const links = await fetchProjects();
  if (!links.length) {
    return new Response(
      "Couldn't find any projects in the database. This might be because the projects table does not exist.",
      {
        status: 200,
      },
    );
  }
  redirect(`/projects/${links[0].slug}`);
}
