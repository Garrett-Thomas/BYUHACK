interface Props {
  label: string;
  on: boolean;
  onToggle: () => void;
}

export default function PillToggle({ label, on, onToggle }: Props) {
  return (
    <button className={'pill-toggle' + (on ? ' on' : '')} type="button" aria-pressed={on} onClick={onToggle}>
      {label}
    </button>
  );
}
