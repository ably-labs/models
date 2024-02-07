import { Drawer } from '../Drawer';
import { Table, IssueType } from '../Table';

interface Props {
  issues: IssueType[];
  id: number;
}

export const Project = ({ issues, id }: Props) => {
  return (
    <Drawer projectId={id}>
      <Table rows={issues} />
    </Drawer>
  );
};
