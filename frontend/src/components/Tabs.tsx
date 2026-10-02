import type { KeyboardEvent } from 'react';

interface Props<T extends string> {
  id: string; // panels use `${id}-${value}`, tabs `${id}-${value}-tab`
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}

/** Page-level tab strip. Left/right arrows move between tabs, as ARIA expects. */
export default function Tabs<T extends string>({ id, tabs, value, onChange }: Props<T>) {
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.value === value);
    const next = tabs[(i + step + tabs.length) % tabs.length];
    onChange(next.value);
    document.getElementById(id + '-' + next.value + '-tab')?.focus();
  };

  return (
    <div className="ptabs" role="tablist" id={id} onKeyDown={onKeyDown}>
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button key={t.value} id={id + '-' + t.value + '-tab'} className={'ptab' + (on ? ' on' : '')}
            type="button" role="tab" aria-selected={on} aria-controls={id + '-' + t.value}
            tabIndex={on ? 0 : -1} onClick={() => onChange(t.value)}>
            {t.label}
            {t.count !== undefined && <span className="ptab-count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
