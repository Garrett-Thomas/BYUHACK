import { useEffect, useRef, useState } from 'react';

interface Props {
  text: string;
  label: string;
  className: string;
}

export default function CopyButton({ text, label, className }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    try { navigator.clipboard.writeText(text); } catch { /* label still confirms */ }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return <button className={className} type="button" onClick={copy}>{copied ? 'Copied ✓' : label}</button>;
}
