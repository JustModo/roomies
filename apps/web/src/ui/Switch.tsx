interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="-m-3 p-3 shrink-0"
    >
      <span className={`flex h-5 w-9 items-center transition-colors duration-200 ease-in-out ${checked ? 'bg-accent' : 'bg-ash/20'}`}>
        <span className={`h-3 w-3 bg-paper transition-transform duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
      </span>
    </button>
  );
}
