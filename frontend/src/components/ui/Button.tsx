import { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  title: string;
  variant?: 'primary' | 'outline' | 'danger';
  isLoading?: boolean;
}

const Button = ({
  title,
  variant = 'primary',
  isLoading = false,
  disabled,
  className = '',
  ...rest
}: ButtonProps) => {
  const base =
    'w-full py-sm px-md rounded-lg font-semibold text-base transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-primary-blue text-white active:bg-primary-blue-dark',
    outline: 'border-2 border-primary-blue text-primary-blue bg-transparent active:bg-neutral-gray100',
    danger: 'border-2 border-semantic-error text-semantic-error bg-transparent active:bg-semantic-error-light',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {title}
    </button>
  );
};

export default Button;
