import { Drawer } from '../Drawer';
import { Table, Issue } from '../Table';

interface Props {
  issues: Issue[];
  id: number;
}

export const Project = ({ issues, id }: Props) => {
  return (
    <Drawer projectId={id}>
      <Table rows={issues} />
    </Drawer>
  );
};
