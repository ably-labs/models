import { Drawer } from '../Drawer';
import { StatusType } from '../Status';
import { Table } from '../Table';

export const Projects = () => {
  return (
    <Drawer>
      <Table rows={rows} />
    </Drawer>
  );
};

const rows = [
  {
    id: 'review-active',
    name: 'Review active accounts',
    dueDate: 'Nov 16, 2023',
    status: 'done' as StatusType,
    owner: {
      firstName: 'Ava',
      lastName: 'Davis',
      color: '#00A5EC',
    },
    storyPoints: 1,
  },
  {
    id: 'content-promotion',
    name: 'Content promotion',
    dueDate: 'Dec 13, 2023',
    status: 'blocked' as StatusType,
    owner: {
      firstName: 'Grace',
      lastName: 'Wilson',
      color: '#FA9013',
    },
    storyPoints: 3,
  },
  {
    id: 'brand-strategy',
    name: 'Brand strategy',
    dueDate: 'Nov 22, 2023',
    status: 'inprogress' as StatusType,
    owner: {
      firstName: 'Lana',
      lastName: 'Steiner',
      color: '#23BB5E',
    },
    storyPoints: 5,
  },
  {
    id: 'design-system',
    name: 'Design system migration ',
    dueDate: 'Dec 10, 2023',
    status: 'todo' as StatusType,
    owner: {
      firstName: 'Demi',
      lastName: 'Wilkinson',
      color: '#F63D68',
    },
    storyPoints: 1,
  },
];
