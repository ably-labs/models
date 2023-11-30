import { Drawer } from '../Drawer';
import { Table, Issue } from '../Table';

interface Props {
  issues: Issue[];
}

export const Project = ({ issues }: Props) => {
  return (
    <Drawer>
      <Table rows={issues} />
    </Drawer>
  );
};
