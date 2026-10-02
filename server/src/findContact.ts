import Anthropic, { APIUserAbortError } from "@anthropic-ai/sdk";
import { client } from "./anthropic.js";

export type Contact = { email: string; label: string } | Record<string, never>;
export type AttemptResult = { email: string; label: string } | null;

const SYSTEM_PROMPT = `You find a real, publicly listed email address for contacting a company's recruiting/HR team or the hiring manager for a given role.

Use web search. Prefer, in order:
1. The hiring manager or recruiter for that role or team.
2. A named recruiter at the company.
3. A recruiting, talent, careers, or HR department address.

Only return an email you actually saw in a search result or page for that company. Never construct or guess an address from a naming pattern. If you can't find one, return found=false with empty strings for email and label.

label = the person's full name if the email belongs to a person, otherwise a short department name (e.g. "University Recruiting", "Talent Acquisition").`;

const MAX_CONTINUATIONS = 5;

// One focus line per parallel attempt so the agents don't all run the same searches.
const FOCUSES = [
  "Focus: the hiring manager or a recruiter for this specific role or team (LinkedIn posts, team pages, job post contacts).",
  "Focus: the company's own pages: careers, jobs, contact, press, university/early-career recruiting pages.",
  "Focus: third-party sources: job boards, university career-center listings, recruiting event pages, news articles quoting a recruiter.",
];

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
// Whole-domain matches only: substring checks would reject real addresses like careers@latest.com.
const PLACEHOLDER_DOMAIN = /^(example\.(com|org|net)|domain\.com|yourcompany\.com|company\.com|email\.com|test\.com)$/;
const PLACEHOLDER_LOCAL = /^(name|firstname|first\.last|firstname\.lastname|your\.?name|email|test)$/;

export function validEmail(s: string): boolean {
  const email = s.trim();
  if (!EMAIL_RE.test(email)) return false;
  const lower = email.toLowerCase();
  const at = lower.lastIndexOf("@");
  return !PLACEHOLDER_DOMAIN.test(lower.slice(at + 1)) && !PLACEHOLDER_LOCAL.test(lower.slice(0, at));
}

function isAbort(err: unknown): boolean {
  return err instanceof APIUserAbortError || (err instanceof Error && err.name === "AbortError");
}

export async function runAttempt(
  info: Record<string, unknown>,
  focus: string,
  signal: AbortSignal,
): Promise<AttemptResult> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Find a recruiting/HR or hiring-manager email for this company and role.\n\nCompany info:\n${JSON.stringify(info, null, 2)}\n\n${focus}`,
    },
  ];

  const send = () =>
    client.beta.messages.create(
      {
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
      },
      { signal },
    );

  let response = await send();
  for (let i = 0; i < MAX_CONTINUATIONS && response.stop_reason === "pause_turn"; i++) {
    if (signal.aborted) throw new APIUserAbortError();
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
  if (!found || !email.trim()) return null;
  return { email: email.trim(), label: label.trim() };
}

// Runs one attempt per focus in parallel. The first valid email wins and the
// other attempts are aborted. Every attempt promise is given handlers up front
// (and none of them can reject), so a losing attempt's abort never surfaces as
// an unhandled rejection.
export async function findContact(
  info: Record<string, unknown>,
  run: typeof runAttempt = runAttempt,
): Promise<Contact> {
  const controllers = FOCUSES.map(() => new AbortController());

  return new Promise<Contact>((resolve, reject) => {
    let settled = 0;
    let completed = 0; // attempts that finished without error (found or not-found)
    let lastError: unknown;

    const watch = (focus: string, i: number) => {
      const { signal } = controllers[i];
      const start = Date.now();
      const record = (result: "found" | "not-found" | "error" | "aborted") => {
        console.log(`find-contact attempt=${i + 1} result=${result} ${Date.now() - start}ms`);
        settled++;
        if (result === "found" || result === "not-found") completed++;
        if (settled === FOCUSES.length) {
          if (completed > 0) resolve({});
          else reject(lastError ?? new Error("All attempts were aborted"));
        }
      };

      // async wrapper: run() starts synchronously and a sync throw becomes a rejection
      (async () => run(info, focus, signal))()
        .then(
          (result) => {
            if (signal.aborted) return record("aborted");
            if (result && validEmail(result.email)) {
              // resolve before record(): record() resolves {} when this is the last attempt to settle
              resolve({ email: result.email.trim(), label: result.label.trim() || "Recruiting team" });
              controllers.forEach((c, j) => j !== i && c.abort());
              return record("found");
            }
            record("not-found");
          },
          (err: unknown) => {
            if (signal.aborted || isAbort(err)) return record("aborted");
            lastError = err;
            console.error(`find-contact attempt=${i + 1} failed`, err);
            record("error");
          },
        )
        .catch(reject);
    };

    FOCUSES.forEach(watch);
  });
}
