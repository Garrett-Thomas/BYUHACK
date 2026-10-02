import { useEffect, useRef, useState } from 'react';

interface Props {
  id: string;
  allLabel: string;
  ariaLabel: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

/** A pill button that opens a checklist panel — multi-select stand-in for a native <select>. */
export default function MultiSelect({ id, allLabel, ariaLabel, options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Close the panel on an outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);

  return (
    <div className="msel" ref={root}>
      <button className="sel msel-btn" type="button" id={id} aria-haspopup="listbox"
        aria-label={ariaLabel} onClick={() => setOpen((o) => !o)}>
        {selected.length === 0 ? allLabel
          : selected.length === 1 ? selected[0]
          : selected.length + ' selected'}
      </button>
      <div className="msel-panel" role="listbox" aria-multiselectable="true" hidden={!open}>
        {options.map((opt) => (
          <label className="msel-opt" key={opt}>
            <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
