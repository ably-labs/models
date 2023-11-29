import { redirect } from 'next/navigation';

import { fetchProjects } from './utils';

export default async function Home() {
  const links = await fetchProjects();
  redirect(`/projects/${links[0].slug}`);
}
