import { Row, RowList } from 'postgres';
import { StatusType } from '../components/Status';

export const StatusTypeValues = ['done', 'inprogress', 'blocked', 'todo'] as const;

export type TableIds = RowList<Row[]>;

export interface Project {
  slug: string;
  name: string;
  description: string;
  color: string;
}

export interface User {
  slug: string;
  first_name: string;
  last_name: string;
  email: string;
  color: string;
  title: string;
}

export interface Issue {
  slug: string;
  name: string;
  due_date: Date;
  status: StatusType;
  owner_id: number;
  story_points: number;
  description: string;
  project_id: number;
}

export interface Comment {
  issue_id: number;
  user_id: number;
  content: string;
}
