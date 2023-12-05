import Skeleton from 'react-loading-skeleton';

interface Props {
  children: React.ReactNode;
  isLoading: boolean;
}

export const FieldWithLoader = ({ children, isLoading }: Props) => {
  if (isLoading) return <Skeleton height={32} />;

  return <div>{children}</div>;
};
