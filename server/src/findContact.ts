import Anthropic from "@anthropic-ai/sdk";
import { client } from "./anthropic.js";

export type Contact = { email: string; label: string } | Record<string, never>;

const SYSTEM_PROMPT = `You find a real, publicly listed email address for contacting a company's recruiting/HR team or the hiring manager for a given role.

Use web search. Prefer, in order:
1. The hiring manager or recruiter for that role or team.
2. A named recruiter at the company.
3. A recruiting, talent, careers, or HR department address.

Only return an email you actually saw in a search result or page for that company. Never construct or guess an address from a naming pattern. If you can't find one, return found=false with empty strings for email and label.

label = the person's full name if the email belongs to a person, otherwise a short department name (e.g. "University Recruiting", "Talent Acquisition").`;

const MAX_CONTINUATIONS = 5;

export async function findContact(info: Record<string, unknown>): Promise<Contact> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Find a recruiting/HR or hiring-manager email for this company and role.\n\nCompany info:\n${JSON.stringify(info, null, 2)}`,
    },
  ];

  const send = () =>
    client.beta.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      output_config: {
        effort: "high",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              found: { type: "boolean" },
              email: { type: "string" },
              label: { type: "string" },
            },
            required: ["found", "email", "label"],
            additionalProperties: false,
          },
        },
      },
      messages,
    });

  let response = await send();
  for (let i = 0; i < MAX_CONTINUATIONS && response.stop_reason === "pause_turn"; i++) {
    messages.push({ role: "assistant", content: response.content });
    response = await send();
  }

  if (response.stop_reason === "refusal") throw new Error("Model refused the request");
  if (response.stop_reason === "max_tokens") throw new Error("Model hit max_tokens");
  if (response.stop_reason === "pause_turn") throw new Error("Too many pause_turn continuations");

  const textBlocks = response.content.filter((b) => b.type === "text");
  const last = textBlocks[textBlocks.length - 1];
  if (!last || last.type !== "text") throw new Error("No text block in response");

  const parsed: unknown = JSON.parse(last.text);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as any).found !== "boolean" ||
    typeof (parsed as any).email !== "string" ||
    typeof (parsed as any).label !== "string"
  ) {
    throw new Error("Model output did not match expected shape");
  }
  const { found, email, label } = parsed as { found: boolean; email: string; label: string };
  if (!found || !email.trim()) return {};
  return { email: email.trim(), label: label.trim() };
}
