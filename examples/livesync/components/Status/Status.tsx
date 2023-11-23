import cn from 'classnames';
import styles from './Status.module.css';

export type StatusType = 'done' | 'inprogress' | 'blocked' | 'todo';

interface Props {
  status: StatusType;
}

export const Status = ({ status }: Props) => {
  return (
    <span className={cn(styles.status, statusMaps[status].className)}>
      <span className={cn(styles.indicator, statusMaps[status].indicatorClassName)} />
      {statusMaps[status].label}
    </span>
  );
};

const statusMaps = {
  done: {
    label: 'Done',
    className: styles.statusDone,
    indicatorClassName: styles.indicatorDone,
  },
  inprogress: {
    label: 'In Progress',
    className: styles.statusInProgress,
    indicatorClassName: styles.indicatorInProgress,
  },
  blocked: {
    label: 'Blocked',
    className: styles.statusBlocked,
    indicatorClassName: styles.indicatorBlocked,
  },
  todo: {
    label: 'To Do',
    className: styles.statusTodo,
    indicatorClassName: styles.indicatorTodo,
  },
};
