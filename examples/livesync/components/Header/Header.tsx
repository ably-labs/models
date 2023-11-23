'use client';

import { HTMLAttributes, useState } from 'react';
import cn from 'classnames';
import { Flex } from '@radix-ui/themes';

import { ExternalUrlIcon, MenuIcon } from '../icons';
import { HowTo } from '../HowTo';
import { Button } from '../Button';

import styles from './Header.module.css';

export const Header = ({ className, children }: HTMLAttributes<HTMLDivElement>) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className={cn(className, styles.headerContainer)}>
      <nav className={styles.header}>
        <h1 className={styles.title}>LiveSync Demo</h1>
        <div className={styles.hiddenOnMobile}>
          <Flex
            gap="5"
            justify="end"
            align="center"
          >
            <HowTo />
            <Button variant="secondary">
              <span>LiveSync Docs </span>
              <ExternalUrlIcon />
            </Button>
            <Button>Sign up</Button>
          </Flex>
        </div>
        <button
          className={styles.button}
          aria-label="Mobile menu"
          onClick={handleMenu}
        >
          <MenuIcon />
        </button>
      </nav>
      <div
        className={cn(styles.menu, {
          [styles.menuIsOpen]: isMenuOpen,
        })}
      >
        {children}
        <div className={styles.divider} />
        <Flex
          gap="4"
          direction="column"
        >
          <HowTo />
          <Flex
            gap="5"
            align="center"
          >
            <Button variant="secondary">
              <span>LiveSync Docs </span>
              <ExternalUrlIcon className={styles.icon} />
            </Button>
            <Button>Sign up</Button>
          </Flex>
        </Flex>
      </div>
    </header>
  );
};
