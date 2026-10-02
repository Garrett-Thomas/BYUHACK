import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Profile } from '../types';
import { rewriteText } from '../lib/rewrite';

interface Props {
  aiKey: string;
  presets?: string[]; // omit for no preset chips, as the email does
  text: string;
  profile: Profile;
  onApply: (text: string) => void;
  extra?: ReactNode;
  maxChars?: number; // default: none for the email, 300 (LinkedIn note) otherwise
}

/** Optional preset chips + prompt row + Rewrite button, shared by notes and the email. */
export default function AiToolbar({ aiKey, presets = [], text, profile, onApply, extra, maxChars }: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const isEmail = aiKey.endsWith(':email');

  async function rewrite(instruction: string) {
    const ins = instruction.trim();
    if (!ins || busy) return;
    setBusy(true);
    const out = await rewriteText(text, ins, profile, maxChars ?? (isEmail ? 0 : 300));
    onApply(out.trim());
    setValue('');
    setBusy(false);
  }

  return (
    <div className="toolbar">
      {presets.length > 0 && (
        <div className="presets">
          {presets.map((label) => (
            <button key={label} className="chip-preset" type="button" onClick={() => rewrite(label)}>{label}</button>
          ))}
        </div>
      )}
      <div className="askrow">
        <input className="inp-sm" id={'ai-' + aiKey} type="text" value={value}
          placeholder={isEmail ? 'Ask AI to change this email…' : 'Ask AI to change this message…'}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); rewrite(value); } }} />
        <button className="btn btn-run" type="button" disabled={busy} onClick={() => rewrite(value)}>
          {busy ? 'Rewriting…' : 'Rewrite'}
        </button>
      </div>
      {extra}
    </div>
  );
}
