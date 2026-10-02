import { z } from "zod";
import { normalizeProfileUrl } from "./normalize.js";

const nullableText = (max: number) => z.string().max(max).nullish();

const mutualSchema = z.object({
  name: z.string().trim().min(1).max(200),
  profileUrl: z
    .string()
    .max(2048)
    .refine((v) => normalizeProfileUrl(v) !== null, {
      message: "Must be a LinkedIn profile URL (https://www.linkedin.com/in/<slug>)",
    })
    .transform((v) => normalizeProfileUrl(v)!),
});

export const connectionInputSchema = z.object({
  source: z.string().trim().min(1).max(50),
  sourceProfileUrl: z
    .string()
    .max(2048)
    .refine((v) => normalizeProfileUrl(v) !== null, {
      message: "Must be a LinkedIn profile URL (https://www.linkedin.com/in/<slug>)",
    }),
  name: z.string().trim().min(1).max(300),
  headline: nullableText(1000),
  company: nullableText(300),
  location: nullableText(300),
  degree: z.enum(["1st", "2nd", "3rd"]).nullish(),
  notes: nullableText(5000),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).nullish(),
  mutuals: z.array(mutualSchema).max(5).nullish(),
  mutualCount: z.number().int().min(0).nullish(),
  capturedAt: z.iso.datetime({ offset: true }),
  extractorVersion: z.string().trim().min(1).max(50),
});

export type ConnectionInput = z.infer<typeof connectionInputSchema>;
