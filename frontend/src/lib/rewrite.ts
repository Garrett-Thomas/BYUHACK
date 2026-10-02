import type { Profile } from '../types';
import { rewriteMessage } from './api';

export async function rewriteText(
  text: string, instruction: string, p: Profile, cap: number,
): Promise<string> {
  // cap: max characters to ask for; 0 for none. Only 300 is LinkedIn's connection-note limit.
  const res = await rewriteMessage({
    text, instruction,
    profile: { name: p.name, school: p.school, highlight: p.highlight, resume: p.resume },
    maxChars: cap || undefined,
  });
  return res.text;
}
