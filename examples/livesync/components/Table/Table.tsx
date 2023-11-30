'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Owner } from '../Owner';
import { Status, StatusType } from '../Status';

import styles from './Table.module.css';

export interface Issue {
  id: number;
  slug: string;
  name: string;
  due_date: string;
  status: StatusType;
  owner_id: number;
  story_points: number;
  description: string;
  owner_first_name: string;
  owner_last_name: string;
  owner_color: string;
}

interface Props {
  rows: Issue[];
}

export const Table = ({ rows }: Props) => {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead className={styles.thead}>
          <tr>
            <th>Task name</th>
            <th>Due date</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Story points</th>
          </tr>
        </thead>
        <tbody className={styles.tbody}>
          {rows.map(
            ({ id, slug, name, due_date, status, owner_color, owner_first_name, owner_last_name, story_points }) => (
              <tr key={slug} onClick={() => router.push(`${pathname}?issue=${id}`)}>
                <th className={styles.issueName}>{name}</th>
                <td className={styles.date}>
                  {new Intl.DateTimeFormat('en-US', {
                    dateStyle: 'medium',
                  })
                    .format(new Date(due_date))
                    .toString()}
                </td>
                <td>
                  <Status status={status} />
                </td>
                <td className={styles.owner}>
                  <Owner firstName={owner_first_name} lastName={owner_last_name} color={owner_color} />
                </td>
                <td className={styles.points}>{story_points}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
};
