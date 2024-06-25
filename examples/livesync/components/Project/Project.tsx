'use client';

import { useEffect, useState } from 'react';
import { Drawer } from '../Drawer';
import { Table, IssueType } from '../Table';
import { fetchIssues } from './actions';

interface Props {
  issues: IssueType[];
  id: number;
}

export const Project = ({ issues: initialIssues, id }: Props) => {
  const [issues, setIssues] = useState<IssueType[]>(initialIssues);

  useEffect(() => {
    async function reload() {
      const newIssues = await fetchIssues(id);
      setIssues(newIssues);
    }

    reload();
  }, [id]);
    
  return (
    <Drawer projectId={id}>
      <Table rows={issues} />
    </Drawer>
  );
};
