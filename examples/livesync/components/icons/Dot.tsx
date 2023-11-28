import { SVGProps } from 'react';

export const DotIcon = (props: SVGProps<SVGSVGElement>) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="3" height="4" viewBox="0 0 3 4" fill="none" {...props}>
      <circle cx="1.5" cy="2" r="1.5" fill="currentColor" />
    </svg>
  );
};
