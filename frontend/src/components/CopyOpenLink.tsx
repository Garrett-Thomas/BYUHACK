import { useEffect, useRef, useState } from 'react';

interface Props {
  text: string;
  href: string;
}

// Copies the message and opens the LinkedIn profile in a new tab in one click, ready to paste.
// A real link (not window.open) so the new tab isn't popup-blocked and cmd-click still works.
export default function CopyOpenLink({ text, href }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    try { navigator.clipboard.writeText(text); } catch { /* label still confirms */ }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2500);
  };

  return (
    <a href={href} target="_blank" rel="noopener" onClick={copy}>
      {copied ? 'Copied ✓ paste it on LinkedIn' : 'Copy & open LinkedIn ↗'}
    </a>
  );
}
