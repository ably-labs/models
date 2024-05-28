'use client';

import { HTMLAttributes, useState } from 'react';
import cn from 'classnames';
import { Flex } from '@radix-ui/themes';
import Link from 'next/link';
import { ExternalUrlIcon, MenuIcon } from '../icons';
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
          <Flex gap="5" justify="end" align="center">
            <Link className={styles.link} href="https://ably.com/docs/products/livesync" target="_blank">
              <Button variant="secondary">
                <span>LiveSync Docs </span>
                <ExternalUrlIcon />
              </Button>
            </Link>
            <Link className={styles.link} href="https://ably.com/sign-up" target="_blank">
              <Button>Sign up</Button>
            </Link>
          </Flex>
        </div>
        <button className={styles.button} aria-label="Mobile menu" onClick={handleMenu}>
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
        <Flex gap="4" direction="column">
          <Flex gap="5" align="center">
          <Link className={styles.link} href="https://ably.com/docs/products/livesync" target="_blank">
            <Button variant="secondary">
              <span>LiveSync Docs </span>
              <ExternalUrlIcon className={styles.icon} />
            </Button>
            </Link>
            <Link className={styles.link} href="https://ably.com/sign-up" target="_blank">
              <Button>Sign up</Button>
            </Link>
          </Flex>
        </Flex>
      </div>
    </header>
  );
};
