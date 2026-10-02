# Parallel HR-Email Search — Spec

Status: **approved**
Scope: `server/src/findContact.ts` (plus a test file). There are no frontend or API-shape changes.

## Problem

`POST /api/find-contact` runs one Claude web-search agent. Results are inconsistent: the same company sometimes yields an email and sometimes `{}`. One run is a single sample of a noisy process.

## Change

Run **3 agents in parallel** for every lookup and use the first valid email any of them returns.

### Behavior

- `findContact(info)` starts 3 independent attempts at once. Each attempt is today's full single-agent run, including the `pause_turn` continuation loop, the refusal and max_tokens handling, and the JSON parse/validation.
- **First valid email wins.** As soon as any attempt resolves with a valid email, return `{ email, label }` and **abort the other attempts**, so they stop spending tokens.
  - Pass an `AbortSignal` to every `client.beta.messages.create(params, { signal })` call, including continuations.
  - Check `signal.aborted` between continuations.
- **What counts as valid:**
  - `found === true`;
  - `email` trimmed, matching a pragmatic email regex such as `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`, with no spaces or angle brackets;
  - not an obvious placeholder: reject when the local part or domain contains `example`, `domain`, `yourcompany`, `email.com` or `test`.

  An attempt that returns `found: true` with an invalid email counts as **no email**, not as an error.
- **No attempt finds an email:**
  - If at least one attempt completed without error (returned not-found), return `{}`.
  - If **all 3 failed** with errors (API error, refusal, max_tokens, unparseable output), throw, so the route returns 502 as today.
- **Label:** use the winning attempt's label, trimmed. If it's empty, use `"Recruiting team"`.
- **Aborts aren't failures.** An aborted attempt's rejection, an `APIUserAbortError` or `AbortError`, must not be logged as a failure or counted toward the all-failed rule.

### Search diversity

Give each attempt a different focus line, appended to the user message, so the three don't all run the same searches:

1. "Focus: the hiring manager or a recruiter for this specific role or team (LinkedIn posts, team pages, job post contacts)."
2. "Focus: the company's own pages: careers, jobs, contact, press, university/early-career recruiting pages."
3. "Focus: third-party sources: job boards, university career-center listings, recruiting event pages, news articles quoting a recruiter."

The system prompt stays the same, including the rule to never construct or guess an address from a naming pattern. Model, effort, tools, structured-output schema and fallbacks also stay exactly as they are now.

### Code structure (for testability)

- Extract today's single run into `runAttempt(info, focus, signal): Promise<AttemptResult>`, where `AttemptResult = { email: string; label: string } | null` (`null` means not found). It throws on error.
- `findContact(info, run = runAttempt)` does the orchestration. The injectable `run` lets tests exercise it without calling the API.
- Put the validity check in an exported pure `validEmail(s): boolean`.
- **Logging:** keep one summary line per request in `app.ts` as today. Add a per-attempt `console.log`, `find-contact attempt=<1-3> result=found|not-found|error|aborted <ms>ms`, with no email addresses in the logs.

### Cost

Up to 3× the tokens per lookup in the worst case, when nothing is found. When one finds an email early, the others are aborted mid-run, which limits the cost. This is accepted.

## Tests (`server/test/findContact.test.ts`, vitest, no network)

Use a fake `run` with controllable promises. Cover:

- **First valid wins:** attempt 2 resolves valid first; the result is attempt 2's email, and the other two signals are aborted.
- **Skips invalid:** attempt 1 resolves `found` with `"not-an-email"`, attempt 3 resolves valid; the result is attempt 3's.
- **Mixed outcomes:** one not-found, one error, one not-found gives `{}` (no throw).
- **All errors:** throws.
- **Aborted attempts:** rejecting with an abort error after a winner doesn't cause an unhandled rejection or change the result.
- **`validEmail`:** accepts normal addresses; rejects `"a@b"`, `"a b@c.com"`, `"jane@example.com"`, `"name@yourcompany.com"`, `"<a@b.com>"`.
- **Label fallback:** an empty winning label gives `"Recruiting team"`.

The existing `api.test.ts` find-contact validation tests must keep passing.

## Done when

`npm run typecheck` and `npm test` pass in `server/`. No live request reaches the Anthropic API during development or tests.
