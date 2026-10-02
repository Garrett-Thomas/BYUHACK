/// <reference types="vite/client" />

type SampleFn = (
  prompt: string,
  opts?: { modelTier?: string; cache?: boolean },
) => Promise<{ text?: string } | null | undefined>;

interface Window {
  claude?: { use(name: string): Promise<SampleFn | null> };
}
