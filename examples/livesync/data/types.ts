import { StatusType } from '../components/Status';

export const StatusTypeValues = ['done', 'inprogress', 'blocked', 'todo'] as const;

export interface Project {
  id: string;
  slug: string;
  name: string;
  description: string;
  color: string;
}

export interface User {
  id: string;
  slug: string;
  first_name: string;
  last_name: string;
  email: string;
  color: string;
  date_added: Date;
  title: string;
}

export interface Issue {
  id: string;
  slug: string;
  name: string;
  due_date: Date;
  status: StatusType;
  owner: string;
  story_points: number;
  description: string;
  project_id: string;
}

export interface Comment {
  id: string;
  issue: string;
  user_id: string;
  created_on: Date;
  content: string;
}
