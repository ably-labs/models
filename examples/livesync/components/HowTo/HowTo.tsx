import { Flex } from '@radix-ui/themes';

import styles from './HowTo.module.css';

export const HowTo = () => {
  return (
    <Flex
      gap="2"
      align="center"
      className={styles.howTo}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className={styles.icon}
        viewBox="0 0 24 24"
        fill="none"
      >
        <g clipPath="url(#clip0_66_9316)">
          <path
            d="M12 9.99976C12.5523 9.99976 13 10.4475 13 10.9998V16.9998C13 17.552 12.5523 17.9998 12 17.9998C11.4477 17.9998 11 17.552 11 16.9998V10.9998C11 10.4475 11.4477 9.99976 12 9.99976Z"
            fill="#03020D"
          />
          <path
            d="M12 7.99976C12.5523 7.99976 13 7.55204 13 6.99976C13 6.44747 12.5523 5.99976 12 5.99976C11.4477 5.99976 11 6.44747 11 6.99976C11 7.55204 11.4477 7.99976 12 7.99976Z"
            fill="#03020D"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M0.25 12C0.25 5.51065 5.51065 0.25 12 0.25C18.4893 0.25 23.75 5.51065 23.75 12C23.75 18.4893 18.4893 23.75 12 23.75C5.51065 23.75 0.25 18.4893 0.25 12ZM12 1.75C6.33908 1.75 1.75 6.33908 1.75 12C1.75 17.6609 6.33908 22.25 12 22.25C17.6609 22.25 22.25 17.6609 22.25 12C22.25 6.33908 17.6609 1.75 12 1.75Z"
            fill="#03020D"
          />
        </g>
        <defs>
          <clipPath id="clip0_66_9316">
            <rect
              width="24"
              height="24"
              fill="white"
            />
          </clipPath>
        </defs>
      </svg>
      <span>How to try this demo</span>
    </Flex>
  );
};
