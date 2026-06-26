interface SwitchProps {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}

const Switch = ({ label, value, onValueChange, disabled = false }: SwitchProps) => {
  return (
    <label
      className={`flex items-center justify-between gap-md cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className="text-sm text-neutral-gray800">{label}</span>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => !disabled && onValueChange(!value)}
        type="button"
        className={[
          'relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0',
          value ? 'bg-primary-blue' : 'bg-neutral-gray200',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
            value ? 'translate-x-6' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </label>
  );
};

export default Switch;
