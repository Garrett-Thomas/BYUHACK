import { client } from "./anthropic.js";

export type Draft = { subject: string; body: string };

const SYSTEM_PROMPT = `You write short cold outreach emails from a student or early-career job seeker to a company's recruiter, hiring manager, or recruiting team, asking to be considered for a specific role.

Addressing: if \`label\` is a person's name, greet them by first name. If it is a department (e.g. "University Recruiting"), greet the team (e.g. "Hi Stripe University Recruiting team,").

Use only facts present in the info about the sender (name, school, highlight, resume, etc.). Never invent experience, metrics, or credentials. If the sender's name is missing, sign off with [Your Name]; don't add other placeholders unless a needed fact is truly missing.

Mention the specific role and company. Pick the one or two most relevant resume points. End with a clear, low-pressure ask (a quick chat, or a referral to the right person) and note that the resume is attached.

Body: plain text, about 120-180 words, short paragraphs, no markdown. Subject: concise and specific, includes the role (e.g. "Software Engineer Intern — Alex Rivera, UC Berkeley").`;

function isDraft(v: unknown): v is Draft {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.subject === "string" &&
    r.subject.trim() !== "" &&
    typeof r.body === "string" &&
    r.body.trim() !== ""
  );
}

export async function draftEmail(info: Record<string, unknown>): Promise<Draft> {
  const response = await client.beta.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            subject: { type: "string" },
            body: { type: "string" },
          },
          required: ["subject", "body"],
          additionalProperties: false,
        },
      },
    },
    messages: [{ role: "user", content: `Draft the email.\n\nInfo:\n${JSON.stringify(info, null, 2)}` }],
  });

  if (response.stop_reason === "refusal") throw new Error("Model refused the request");
  if (response.stop_reason === "max_tokens") throw new Error("Model hit max_tokens");

  const textBlocks = response.content.filter((b) => b.type === "text");
  const last = textBlocks[textBlocks.length - 1];
  if (!last || last.type !== "text") throw new Error("No text block in response");

  const parsed: unknown = JSON.parse(last.text);
  if (!isDraft(parsed)) throw new Error("Model output did not match expected shape");
  return { subject: parsed.subject.trim(), body: parsed.body.trim() };
}
