import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  variant?: 'default' | 'premium';
  className?: string;
}

const Card = ({ children, variant = 'default', className = '' }: CardProps) => {
  const base = 'bg-white rounded-2xl shadow-md p-xl';
  const variants = {
    default: '',
    premium: 'border border-neutral-gray200',
  };

  return <div className={`${base} ${variants[variant]} ${className}`}>{children}</div>;
};

export default Card;
