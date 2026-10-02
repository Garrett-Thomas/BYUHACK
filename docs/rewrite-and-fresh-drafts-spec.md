# Real AI Rewrite + Drafts That Follow the Profile — Spec

Status: **approved**

## Task A — `POST /api/rewrite` (Haiku, structured output)

### Problem
The Rewrite buttons call `window.claude.use('sample')`, which only exists inside claude.ai artifacts. Locally it silently falls back to `localRewrite`, which does canned string substitutions. "More enthusiastic", "Add a question" and any custom instruction return the text unchanged, and "Mention my project" inserts the demo profile's "PairPad".

### Server
- **New file `server/src/rewrite.ts`** exporting `rewrite(input): Promise<{ text: string }>`. It uses the shared client from `anthropic.ts`.
- **Request** (verified against the claude-api skill, follow exactly):
  ```ts
  client.messages.create({
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
    messages: [{ role: "user", content: <built below> }],
  })
  ```
  - Do **not** send `thinking`, `effort`, `fallbacks`, `betas`, `temperature` or tools. `effort` errors on Haiku 4.5, and the fallbacks parameter isn't for Haiku.
  - Throw on `stop_reason` `refusal` / `max_tokens`. Take the last `text` block, `JSON.parse` it, and validate `text` is a non-empty string with a type guard. Return it trimmed.
- **System prompt** (keep it tight):
  - You rewrite short job-outreach messages (LinkedIn notes, intro requests, recruiter emails) following the user's instruction.
  - Keep every fact truthful to the sender's profile and resume. Never invent experience, metrics, names or credentials. Keep the recipient's name and the role/company.
  - If `maxChars` is given, the result must be at most that many characters.
  - Return only the rewritten message in `text`: no preamble, no quotes, no markdown.
- **User content:** the instruction, the max length if any, the sender profile (name, school, highlight, resume), then the message, each clearly labeled.
- **Route `POST /api/rewrite`** in `app.ts`.
  - **Body:** `{ text: string, instruction: string, profile: { name, school, highlight, resume }, maxChars?: number }`.
  - **Validation:**
    - `text` and `instruction` must be non-empty strings, at most 10,000 and 500 characters.
    - `profile` must be an object whose four fields are strings; empty is allowed.
    - `maxChars`, when present, must be an integer from 50 to 5000.
    - Anything else returns 400 `{ error }`, in the existing style.
  - **Success:** 200 `{ text }`.
  - **Upstream failure:** 502 `{ error: "Upstream rewrite failed" }`, with server-side logging like find-contact.
  - **Logging:** one line per request, `rewrite instruction=<first 40 chars, JSON-quoted> result=ok|error <ms>ms`, with no message text in logs.
- Add it to `openapi.ts`. Tests: validation 400s only, no upstream calls, the same pattern as the existing find-contact/draft-email validation tests.

### Frontend (only these files: `lib/rewrite.ts`, `lib/api.ts`, `components/AiToolbar.tsx`, `global.d.ts`)
- `api.ts`: add `rewriteMessage({ text, instruction, profile, maxChars? }) => post<{ text: string }>('/api/rewrite', ...)`.
- `rewrite.ts`: `rewriteText(text, instruction, profile, cap)` calls `rewriteMessage`, passing `maxChars: cap || undefined`. **Delete** `getSample`, `localRewrite` and the `window.claude` path; also remove the now-unused `window.claude` / `SampleFn` declarations in `global.d.ts` if nothing else uses them. Errors propagate.
- **`AiToolbar.tsx`:**
  - On error, keep the original text, stop the busy state, and show a small inline error under the ask row: "Rewrite failed — is the Warmline server running?" (or the `ApiError` message). Use existing muted/error styling, and clear the message on the next attempt.
  - On success, keep the existing behavior (`onApply(newText)`, clear the input).
  - The preset buttons stay as they are; they're now real instructions.

## Task B — Drafts follow profile changes

### Problem
A message is drafted once (in `toContact`) and stored as plain text. Editing the profile, such as changing your name, leaves every existing draft with the old name. `mergeContacts` decides "untouched" by comparing the stored text against a draft made with the *current* profile, so after any profile change every old draft looks edited and is never regenerated.

### Fix (only these files: `types.ts`, `hooks/useCollector.ts`, `App.tsx`, `lib/drafting.ts`, `screens/*`; do NOT touch `AiToolbar.tsx`, `lib/rewrite.ts`, `lib/api.ts`)
- **`Contact.edited: boolean`:**
  - `false` for new contacts.
  - Set to `true` whenever the message text changes because the user did something, meaning any `onChange({ text })` from a card: typing, or the AI toolbar's `onApply`, which already goes through the card's `onChange`.
  - Do this in `App.tsx`'s `updateContact`: a patch containing `text` sets `edited: true`, unless the patch explicitly includes `edited: false`, as redrafts do.
  - **"Ask {other} instead"** redrafts deliberately: it sends `{ mutualIndex, text: <new draft>, edited: false }`.
- **Auto-redraft on profile change:**
  - When `profile` changes, recompute the text of every contact with `edited === false`, in every job, using `draftContact(contact, job, profile)`.
  - Do it in `App.tsx` with an effect keyed on the profile fields that feed drafts (name, school, highlight). Find each job through the existing job lookup, so company jobs are included.
  - Debounce about 400ms so typing a name doesn't redraft on every keystroke.
  - Leave edited contacts alone.
- **`mergeContacts`:** use the flag instead of string comparison. If `!c.edited` and the degree, mutuals or name changed, redraft. Never touch edited text.
- **Persisted data (revive):** stored contacts from before this change have no `edited` field. In `App.tsx`'s `asData` reviver, set `edited = true` when the field is missing, to be safe. Then, once jobs are loaded, a one-time pass sets `edited = false` for those contacts whose text equals a fresh `draftContact` with the current profile. It's fine if older stale drafts stay "edited"; the user can clear them by using a new **Reset to draft** link, below.
- **Reset to draft:** in the links row of `ContactCard` and the mutual card in `PairRow`, add a small text button **Reset to draft**, shown only when `edited`. It sets `{ text: draftContact(...), edited: false }`.
- **Email (server-drafted):**
  - Add to `Email` a `profileKey: string`: the name|school|highlight used when it was drafted (set where the email is created in `useCollector.loadEmail`), and `edited: boolean`, set in `updateEmail` when subject or text change.
  - When the current profile's key differs from `profileKey` and the email isn't edited, show a one-line notice above the composer: "Your profile changed since this email was drafted." with a **Redraft** button that reruns only the email branch (`onRetry('email')`).
  - Don't redraft automatically; it costs an API call.
  - Revive missing `profileKey` as the current key, and missing `edited` as `true`.

## Done when
- **Task A:** `npm run typecheck` and `npm test` pass in `server/`, and `npm run build` passes in `frontend/`.
- **Task B:** `npm run build` passes in `frontend/`.
- No live Anthropic calls during development; I'll do a live curl of `/api/rewrite` after merging.
