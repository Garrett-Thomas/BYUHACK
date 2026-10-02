import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Profile } from '../types';
import { ApiError } from '../lib/api';
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
  const [error, setError] = useState<string | null>(null);
  const isEmail = aiKey.endsWith(':email');
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow: min 2 rows (rows attr), capped at 6 rows via CSS max-height.
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  }, [value]);

  async function rewrite(instruction: string) {
    const ins = instruction.trim();
    if (!ins || busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await rewriteText(text, ins, profile, maxChars ?? (isEmail ? 0 : 300));
      onApply(out.trim());
      setValue('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Rewrite failed — is the Warmline server running?');
    } finally {
      setBusy(false);
    }
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
        <textarea ref={taRef} className="inp-sm ta-ask" id={'ai-' + aiKey} rows={2} value={value}
          placeholder={isEmail ? 'Ask AI to change this email…' : 'Ask AI to change this message…'}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); rewrite(value); }
          }} />
        <button className="btn btn-run" type="button" disabled={busy} onClick={() => rewrite(value)}>
          {busy ? 'Rewriting…' : 'Rewrite'}
        </button>
      </div>
      {error && <div className="count-over" style={{ fontSize: 12 }} role="alert">{error}</div>}
      {extra}
    </div>
  );
}
