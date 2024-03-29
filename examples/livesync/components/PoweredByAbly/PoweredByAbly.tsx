import styles from './PoweredByAbly.module.css';

export const PoweredByAbly = () => {
  return (
    <a href="https://ably.com" target="_blank" rel="noreferrer noopener" className={styles.poweredBy}>
      <span className={styles.label}>Powered by</span>
      <svg xmlns="http://www.w3.org/2000/svg" width="78" height="24" viewBox="0 0 78 24" fill="none">
        <path
          d="M48.1386 18.7338V3.06592H51.0239V8.73823C52.0013 7.82606 53.2601 7.32015 54.5894 7.32015C57.7092 7.32015 60.4772 9.6504 60.4772 13.1611C60.4772 16.6718 57.7092 19.0097 54.5894 19.0097C53.1898 19.0097 51.8683 18.4655 50.8831 17.4767V18.7338H48.1386ZM57.5919 13.1611C57.5919 11.1988 56.1689 9.8267 54.3079 9.8267C52.4939 9.8267 51.0942 11.1298 51.0239 13.0231V13.1611C51.0239 15.1234 52.447 16.4955 54.3079 16.4955C56.1689 16.4955 57.5919 15.1234 57.5919 13.1611ZM61.8143 18.7338V3.06592H64.6995V18.7338H61.8143ZM68.7342 22.7964L70.4153 18.8641L65.849 7.5961H68.9688L71.8775 15.4683L74.8331 7.5961H77.9999L71.8071 22.804H68.7342V22.7964ZM43.5566 7.5961V9.01418C42.5557 7.94104 41.1561 7.32782 39.7174 7.32782C36.5976 7.32782 33.8296 9.65806 33.8296 13.1688C33.8296 16.6871 36.5976 19.0097 39.7174 19.0097C41.2109 19.0097 42.6261 18.3735 43.6504 17.2314V18.7414H46.1682V7.5961H43.5566ZM43.2751 13.1611C43.2751 15.1004 41.852 16.4955 39.9911 16.4955C38.1301 16.4955 36.707 15.1004 36.707 13.1611C36.707 11.2218 38.1301 9.8267 39.9911 9.8267C41.8051 9.8267 43.2047 11.1528 43.2751 13.0231V13.1611Z"
          fill="#03020D"
        />
        <path
          d="M14.7547 0L2.40829 22.1527L0 20.497L11.4238 0H14.7547ZM14.9267 0L27.2731 22.1527L29.6814 20.497L18.2577 0H14.9267Z"
          fill="url(#paint0_linear_66_9101)"
        />
        <path
          d="M27.1009 22.2831L14.8405 12.8701L2.58008 22.2831L5.0822 24.0001L14.8405 16.5111L24.5988 24.0001L27.1009 22.2831Z"
          fill="url(#paint1_linear_66_9101)"
        />
        <defs>
          <linearGradient
            id="paint0_linear_66_9101"
            x1="4.18761"
            y1="28.0665"
            x2="24.3817"
            y2="5.18853"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FF5416" />
            <stop offset="0.2535" stopColor="#FF5115" />
            <stop offset="0.461" stopColor="#FF4712" />
            <stop offset="0.6523" stopColor="#FF350E" />
            <stop offset="0.8327" stopColor="#FF1E08" />
            <stop offset="1" stopColor="#FF0000" />
          </linearGradient>
          <linearGradient
            id="paint1_linear_66_9101"
            x1="8.19227"
            y1="29.5196"
            x2="20.1275"
            y2="15.9981"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FF5416" />
            <stop offset="0.2535" stopColor="#FF5115" />
            <stop offset="0.461" stopColor="#FF4712" />
            <stop offset="0.6523" stopColor="#FF350E" />
            <stop offset="0.8327" stopColor="#FF1E08" />
            <stop offset="1" stopColor="#FF0000" />
          </linearGradient>
        </defs>
      </svg>
    </a>
  );
};
