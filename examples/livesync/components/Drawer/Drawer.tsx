'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import cn from 'classnames';
import { Badge, Button, Heading, Select, TextArea } from '@radix-ui/themes';
// @ts-ignore
import shader from 'shader';
import { Owner } from '../Owner';
import { Status, StatusType } from '../Status';
import { DatePicker } from '../DatePicker';
import { Label } from './Label';

import styles from './Drawer.module.css';
import { CloseIcon } from '../icons/Close';

interface Props {
  children: React.ReactNode;
}

export const Drawer = ({ children }: Props) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const handleCloseDrawer = () => {
    router.push(pathname);
  };

  return (
    <>
      {children}
      <aside
        className={cn(styles.container, {
          [styles.isOpen]: searchParams.has('task'),
        })}
      >
        <Button radius="full" variant="ghost" className={styles.closeButton} onClick={handleCloseDrawer}>
          <CloseIcon />
        </Button>
        <div className={styles.inner}>
          <h3 className={styles.name}>Dashboard design optimisation</h3>
          <div className={styles.drawerSummary}>
            <Label>Owner</Label>
            <div>
              <Select.Root defaultValue={owners[0].lastName} size="3">
                <Select.Trigger variant="ghost" className={styles.trigger} />
                <Select.Content position="popper" variant="soft" className={styles.optionsList} align="start">
                  {owners.map(({ firstName, lastName, color }) => (
                    <Select.Item key={lastName} value={lastName} className={styles.selectItem}>
                      <Owner variant="small" firstName={firstName} lastName={lastName} color={color} />
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>
            <Label>Due date</Label>
            <div>
              <DatePicker />
            </div>
            <Label>Projects</Label>
            <div>
              <Select.Root defaultValue={projects[0].name} size="3">
                <Select.Trigger variant="ghost" className={styles.trigger} />
                <Select.Content position="popper" variant="soft" className={styles.optionsList} align="start">
                  {projects.map(({ name, color }) => (
                    <Select.Item key={name} value={name} className={styles.selectItem}>
                      <Badge
                        style={{ backgroundColor: color, color: shader(color, -0.6) }}
                        variant="soft"
                        radius="full"
                        highContrast
                        className={styles.badge}
                      >
                        {name}
                      </Badge>
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>

            <Label>Status</Label>
            <div>
              <Select.Root defaultValue="done" size="3">
                <Select.Trigger variant="ghost" className={styles.trigger} />
                <Select.Content position="popper" variant="soft" className={styles.optionsList} align="start">
                  {statuses.map((status) => (
                    <Select.Item key={status} value={status} className={styles.selectItem}>
                      <Status status={status as StatusType} />
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>
          </div>
          <div>
            <Heading mb="3" size="2" weight="bold" as="h4" className={styles.descriptionTitle}>
              Description
            </Heading>
            <TextArea
              variant="soft"
              placeholder="Reply to comment…"
              rows={10}
              className={styles.description}
              defaultValue="The goal is to improve the usability and user experience of our current dashboard. The dashboard is the first thing our users see after logging in, and it's crucial that it's intuitive and user-friendly. The optimization should focus on better information architecture, visual hierarchy, and quicker access to important features."
            />
          </div>
        </div>
      </aside>
    </>
  );
};

const owners = [
  {
    firstName: 'Xander',
    lastName: 'Cage',
    color: '#bada55',
  },
  {
    firstName: 'Lucy',
    lastName: 'Suave',
    color: '#ffff00',
  },
  {
    firstName: 'Dave',
    lastName: 'Crods',
    color: '#00bfff',
  },
];

const projects = [
  {
    name: 'Marketing',
    color: '#EEF4FF',
  },
  {
    name: 'Socials',
    color: '#F9F5FF',
  },
  {
    name: 'IT',
    color: '#EBFAFA',
  },
];

const statuses = ['done', 'inprogress', 'todo', 'blocked'];
