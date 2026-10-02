import type { Profile } from '../types';

let samplePromise: Promise<SampleFn | null> | null = null;
function getSample(): Promise<SampleFn | null> {
  if (!samplePromise) {
    const use = window.claude && window.claude.use;
    samplePromise = (use ? window.claude!.use('sample') : Promise.resolve(null))
      .catch(() => null);
  }
  return samplePromise;
}

export function localRewrite(text: string, instruction: string): string {
  const i = instruction.toLowerCase();
  let t = text;
  if (i.includes('short')) {
    const s = t.split(/(?<=[.!?])\s+/);
    t = s.slice(0, 2).join(' ') + ' Thanks!';
  }
  if (i.includes('formal')) {
    t = t.replace(/^Hi /, 'Hello ')
         .replace('Thanks either way!', 'Thank you for your time and consideration.')
         .replace(/I'm /g, 'I am ');
  }
  if (i.includes('warm') || i.includes('friend')) {
    t = t.replace(/^(Hi|Hello) ([^,\n]+),/, "$1 $2, hope your week's going well!");
  }
  if (i.includes('project')) {
    t = t.replace(/Thanks/, 'I can share a quick demo of PairPad if helpful. Thanks');
  }
  return t;
}

export async function rewriteText(
  text: string, instruction: string, p: Profile, isEmail: boolean,
): Promise<string> {
  const limit = isEmail ? '' : 'Keep it under 300 characters (LinkedIn note limit). ';
  let out: string | null = null;
  try {
    const sample = await getSample();
    if (sample) {
      const res = await sample(
        'Rewrite this job-referral outreach message. Instruction: "' + instruction + '". ' +
        "Keep it truthful to the sender's background. " + limit +
        'Return ONLY the rewritten message, no preamble.\n\n' +
        'Sender: ' + p.name + ', ' + p.school + '. Highlight: ' + p.highlight + '.\n' +
        'Resume:\n' + p.resume + '\n\nMessage:\n' + text,
        { modelTier: 'quick', cache: false },
      );
      out = (res && res.text) || null;
    }
  } catch (e) {
    out = (e as { text?: string } | null)?.text || null;
  }
  if (!out) {
    await new Promise((r) => setTimeout(r, 600));
    out = localRewrite(text, instruction);
  }
  return out;
}
