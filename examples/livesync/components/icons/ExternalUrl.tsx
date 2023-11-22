import { SVGProps } from 'react';

export const ExternalUrlIcon = (props: SVGProps<SVGSVGElement>) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="16"
      viewBox="0 0 15 16"
      fill="none"
      {...props}
    >
      <g clipPath="url(#clip0_66_10356)">
        <path
          d="M10 1.75H13.75V6.125"
          stroke="currentColor"
          strokeWidth="1.875"
          strokeLinecap="round"
          strokeLinejoin="bevel"
        />
        <path
          d="M13.9489 1.5498L8.01135 7.7998"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M13.75 9.54762V11.75C13.75 13.1307 12.6307 14.25 11.25 14.25H3.75C2.36929 14.25 1.25 13.1307 1.25 11.75V4.25C1.25 2.86929 2.36929 1.75 3.75 1.75H6.5625"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
      <defs>
        <clipPath id="clip0_66_10356">
          <rect
            width="15"
            height="15"
            fill="white"
            transform="translate(0 0.5)"
          />
        </clipPath>
      </defs>
    </svg>
  );
};
