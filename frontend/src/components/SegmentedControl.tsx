interface Props<T> {
  id: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

export default function SegmentedControl<T extends string | boolean>({ id, options, value, onChange }: Props<T>) {
  return (
    <span className="seg" id={id}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={value === o.value ? 'on' : ''}
          aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </span>
  );
}
