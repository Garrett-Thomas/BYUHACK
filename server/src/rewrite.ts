import { client } from "./anthropic.js";

export type RewriteProfile = { name: string; school: string; highlight: string; resume: string };
export type RewriteInput = {
  text: string;
  instruction: string;
  profile: RewriteProfile;
  maxChars?: number;
};

const SYSTEM_PROMPT = `You rewrite short job-outreach messages (LinkedIn notes, intro requests, recruiter emails) following the user's instruction.

Keep every fact truthful to the sender's profile and resume. Never invent experience, metrics, names, or credentials. Keep the recipient's name and the role/company.

If a maximum length is given, the result must be at most that many characters.

Return only the rewritten message in \`text\`: no preamble, no quotes, no markdown.`;

function isRewrite(v: unknown): v is { text: string } {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.text === "string" && r.text.trim() !== "";
}

function buildContent({ text, instruction, profile, maxChars }: RewriteInput): string {
  return [
    `Instruction:\n${instruction}`,
    maxChars === undefined ? null : `Maximum length: ${maxChars} characters`,
    `Sender profile:\nName: ${profile.name}\nSchool: ${profile.school}\nHighlight: ${profile.highlight}\nResume:\n${profile.resume}`,
    `Message to rewrite:\n${text}`,
  ]
    .filter((s) => s !== null)
    .join("\n\n");
}

export async function rewrite(input: RewriteInput): Promise<{ text: string }> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
          additionalProperties: false,
        },
      },
    },
    messages: [{ role: "user", content: buildContent(input) }],
  });

  if (response.stop_reason === "refusal") throw new Error("Model refused the request");
  if (response.stop_reason === "max_tokens") throw new Error("Model hit max_tokens");

  const textBlocks = response.content.filter((b) => b.type === "text");
  const last = textBlocks[textBlocks.length - 1];
  if (!last || last.type !== "text") throw new Error("No text block in response");

  const parsed: unknown = JSON.parse(last.text);
  if (!isRewrite(parsed)) throw new Error("Model output did not match expected shape");
  return { text: parsed.text.trim() };
}
