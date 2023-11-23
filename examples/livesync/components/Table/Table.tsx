'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Owner } from '../Owner';
import { Status, StatusType } from '../Status';

import styles from './Table.module.css';

interface Row {
  id: string;
  name: string;
  dueDate: string;
  status: StatusType;
  owner: {
    firstName: string;
    lastName: string;
    color: string;
  };
  storyPoints: number;
}

interface Props {
  rows: Row[];
}

export const Table = ({ rows }: Props) => {
  const pathname = usePathname();
  const router = useRouter();

  const handleRowClick = () => {
    router.push(`${pathname}?task=1`);
  };

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
          {rows.map(({ id, name, dueDate, status, owner, storyPoints }) => (
            <tr key={id} onClick={handleRowClick}>
              <th>{name}</th>
              <td className={styles.date}>{dueDate}</td>
              <td>
                <Status status={status} />
              </td>
              <td className={styles.owner}>
                <Owner {...owner} />
              </td>
              <td className={styles.points}>{storyPoints}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
