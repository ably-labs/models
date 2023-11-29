import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import cn from 'classnames';
import * as Accordion from '@radix-ui/react-accordion';

import styles from './Item.module.css';
import { ChevronUpIcon } from '../icons';

export interface ProjectType {
  id: number;
  slug: string;
  name: string;
  description: string;
  color: string;
  updated_at: Date;
}
export interface MenuItemType {
  title: string;
  to: string;
  Icon?: ReactNode;
  value: string;
  links?: ProjectType[];
  isComingSoon?: boolean;
}

export const Item = ({ title, to, Icon, value, links, isComingSoon }: MenuItemType) => {
  const pathname = usePathname();
  const itemClassName = cn(styles.item, {
    [styles.isComingSoon]: isComingSoon,
    [styles.activePage]: pathname === to,
  });

  const renderTrigger = () => {
    return (
      <>
        <span className={styles.itemInner}>
          {Icon && Icon}
          <div className={styles.title}>
            {title}
            {isComingSoon && <div className={styles.comingSoon}>Coming soon</div>}
          </div>
        </span>
        {links && <ChevronUpIcon className={styles.chevron} />}
      </>
    );
  };

  if (links) {
    return (
      <Accordion.Item value={value}>
        <Accordion.Trigger className={cn(itemClassName, styles.accordionItem)}>{renderTrigger()}</Accordion.Trigger>
        <Accordion.Content className={styles.content}>
          <div className={styles.contentInner}>
            {links.map(({ id, slug, name }) => {
              const href = `/projects/${slug}`;
              return (
                <Link
                  key={slug}
                  href={href}
                  className={cn(styles.innerLink, {
                    [styles.innerLinkActive]: pathname === href,
                  })}
                >
                  {name}
                </Link>
              );
            })}
          </div>
        </Accordion.Content>
      </Accordion.Item>
    );
  }

  return (
    <Accordion.Item value={value} asChild>
      <Link href={to} className={itemClassName}>
        {renderTrigger()}
      </Link>
    </Accordion.Item>
  );
};
