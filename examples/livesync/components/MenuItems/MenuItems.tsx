'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { usePathname } from 'next/navigation';

import { Item, MenuItemType } from './Item';

interface Props {
  items: MenuItemType[];
}

export const MenuItems = ({ items }: Props) => {
  const pathname = usePathname();

  return (
    <Accordion.Root type="single" collapsible defaultValue={pathname.includes('/projects') ? 'projects' : undefined}>
      {items.map((item) => (
        <Item key={item.value} {...item} />
      ))}
    </Accordion.Root>
  );
};
