import { SVGProps } from 'react';

export const ChevronUpIcon = (props: SVGProps<SVGSVGElement>) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" {...props}>
      <path
        d="M15 12.5L10 7.5L5 12.5"
        stroke="currentColor"
        strokeWidth="1.38889"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
