# Mutual-Connection Intros — Spec

Status: **approved**
Builds on: `docs/degree-sections-and-company-scope-spec.md` (implemented through `4caf7f0`).

## Goal

For each 2nd-degree person, save the up to two named mutual connections LinkedIn shows on their search card. The 2nd-degree section then shows each person as a pair: **your 1st-degree mutual → the 2nd-degree target**. The drafted message is to the mutual, asking them to message the target on your behalf.

## What the search card shows

Verified on a live 2nd-degree search on 2026-10-02. Inside each `[role="listitem"]` card there is a mutual line in one of these forms, where each named mutual is an `a[href*="/in/"]` link inside that line:
- "**A** & **B** are mutual connections"
- "**A** is a mutual connection"
- "**A**, **B** & 7 other mutual connections"

The rest of the line may also contain a "· 675 followers" suffix.

The person's own name link is also an `/in/` link in the card. Mutual links are the `/in/` links inside the element whose text matches `/mutual connection/i`, excluding the person's own profile URL.

## Extension

- `extractSearchResults` adds to each record:
  - `mutuals: { name: string; profileUrl: string }[]`: at most 2, in on-page order, normalized with `profileUrlFrom`. Never include the person themselves. Skip any mutual without a usable link.
  - `mutualCount: number | null`: the number of named mutuals plus N from "& N other(s)". So "A & B are…" gives 2, "A is a…" gives 1, and "A, B & 7 other…" gives 9. It's `null` when the card has no mutual line.
- **A 2nd-degree record with zero linked mutuals is dropped entirely, not saved** (user decision). 1st- and 3rd-degree records are unaffected; send `mutuals: []` and `mutualCount: null` for them.
- `extractorVersion` becomes `"1.3.0"`.
- **Fixture:** update `fixtures/people-search.html` so each 2nd-degree card has a mutual line using the three forms above, with FAKE names and `/in/` links. Include one 2nd-degree card with a mutual line but no links; it must be dropped. Add tests for each form, the counts, excluding the self link, and the drop rule.
- The background's capture validation accepts the new fields: `mutuals` is an array of at most 2 entries with non-empty name and `/in/` URL, and `mutualCount` is a non-negative integer or null.

## Server

- **Migration 4:**
  - `ALTER TABLE connections ADD COLUMN mutual_count INTEGER`
  - `CREATE TABLE connection_mutuals(connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE, position INTEGER NOT NULL, name TEXT NOT NULL, profile_url TEXT NOT NULL, PRIMARY KEY(connection_id, position))`
- **Ingestion schema:**
  - `mutuals`: optional array, max 5, of `{ name: 1–200 chars, profileUrl: a LinkedIn /in/ URL, normalized with normalizeProfileUrl (invalid gives 422) }`.
  - `mutualCount`: optional non-negative integer, or null.
- **Upsert** replaces the mutuals: delete, then insert in order. An omitted field clears it, the same as other fields.
- **Every returned connection** includes `mutuals: [{ name, profileUrl }]` (always an array, ordered by position) and `mutualCount: number | null`.
- **List endpoints** must not do N+1 queries per row: fetch mutuals for the page's ids in one query.
- Update `openapi.ts` and the tests:
  - round-trip
  - replace on upsert
  - cascade on delete
  - 422 for a bad mutual URL or a negative count
  - migration 4 applying to a v3 database that has rows (connections, tags and company_scopes survive)

## Frontend

### Data
- `ApiConnection` gains `mutuals` and `mutualCount`.
- `Contact` gains:
  - `mutuals: { name: string; profileUrl: string }[]`
  - `mutualCount: number | null`
  - `mutualIndex: number` (which mutual is selected, default 0)
- `mergeContacts` refreshes `mutuals` and `mutualCount`. It keeps `text`, `status` and `mutualIndex`, clamping `mutualIndex` if the list shrank.

### 2nd-degree section layout
Each 2nd-degree contact that has at least one mutual renders as a pair row:

```
[ Mutual card ]  →  [ Target card ]
```

- **Mutual card:** the existing `ccard` style, with:
  - an avatar with the mutual's initials, their name, the degree chip `1st`, and the title line "Your 1st-degree connection";
  - the message textarea (the intro request, below) with the existing AI toolbar (Shorter / Warmer / More formal / Rewrite / custom ask), **Copy message**, and **Open LinkedIn profile ↗** pointing to the mutual's profile;
  - the outreach status button, cycling Not sent → Sent → Replied, stored on the contact as today;
  - when the contact has 2 mutuals, a small text button **Ask {other first name} instead**, which switches `mutualIndex` and redrafts the message.
- **Target card:** the same `ccard` visual style, without the textarea or toolbar. It shows:
  - avatar, name, degree chip `2nd`, and title (headline);
  - `+N more mutual connections` when `mutualCount` exceeds the number of named mutuals;
  - **Open LinkedIn profile ↗** pointing to the target.
- **Arrow:** a `→` between the cards. Use a two-column grid with the arrow in a narrow middle column. Below ~720px wide, stack the cards with a `↓` instead. Inline styles or a few new rules in `styles.css` are fine; reuse existing tokens and classes.
- **Older 2nd-degree rows saved before this change** (no mutuals) render as today's single card with the current 2nd-degree note. This only covers existing data; new captures never produce it.
- The 1st-degree and Other sections are unchanged.

### Intro-request message
New `draftIntroRequest(mutual, target, job, profile)` in `lib/drafting.ts`. It's a normal message to an existing connection, so there's **no 300-character cap**; aim for about 600 characters at most. Shape:

> Hi {mutual first}, hope you're doing well! I noticed you're connected with {target first}, who's {target headline, trimmed to the part before " | " or " · ", or "at {company}" if empty}. I'm applying for the {role} role at {company}. Would you be open to sending {target first} a quick note? Something like: "Hey {target first}, my friend {profile.name} ({school before first comma}) is applying for the {role} role at {company}. They {highlight}. Would you be open to a quick chat or a referral?" Totally fine if not, thanks either way!

When the job has no listing, use "hoping to join {company} as a software engineer" wording, matching `draftNote`. Switching mutuals with **Ask … instead** redrafts the message for the new mutual.

## Testing

- **Automated:**
  - `server`: typecheck plus tests.
  - `extension`: build plus tests.
  - `frontend`: build.
- **Browser** (later, if the user asks): run a 2nd-degree capture, confirm the mutuals are saved, and confirm the pair rows render.

## Agent breakdown

Three Sonnet agents in parallel (`server/`, `extension/`, `frontend/`). Then I review, run the checks and commit.
