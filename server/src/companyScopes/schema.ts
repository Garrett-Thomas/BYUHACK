import { z } from "zod";

const nullableText = (max: number) => z.string().max(max).nullish();

export const companyScopeInputSchema = z.object({
  linkedinSlug: nullableText(300),
  linkedinName: nullableText(300),
  linkedinIds: z.array(z.string().regex(/^\d{1,15}$/, "Must be 1-15 digits")).min(1).max(50),
});

export type CompanyScopeInput = z.infer<typeof companyScopeInputSchema>;
