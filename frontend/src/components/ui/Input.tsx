import { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const Input = ({ label, id, className = '', ...rest }: InputProps) => {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="mb-md">
      <label htmlFor={inputId} className="block text-sm font-medium text-neutral-gray800 mb-xs">
        {label}
      </label>
      <input
        id={inputId}
        className={[
          'w-full border border-neutral-gray200 rounded-lg px-md py-sm text-base text-neutral-gray800',
          'placeholder:text-neutral-gray500',
          'focus:outline-none focus:border-primary-blue focus:ring-1 focus:ring-primary-blue',
          'disabled:opacity-50 disabled:bg-neutral-gray100',
          'transition-colors duration-150',
          className,
        ].join(' ')}
        {...rest}
      />
    </div>
  );
};

export default Input;
