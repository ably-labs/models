import { redirect } from 'next/navigation';
import { fetchProjects } from './utils';

export async function GET() {
  const links = await fetchProjects();
  redirect(`/projects/${links[0].slug}`);
}
