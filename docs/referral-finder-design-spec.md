# Warmline — Referral Finder · Design Spec

Source of truth: claude.ai design project **"Warmline job referral platform"**
(`45128bf2-621a-48d4-bf54-cdd0ff36c472`), file `Referral Finder.dc.html`,
runtime `support.js`.

Everything below is extracted from that file. Where this spec adds something the
source does not define, it is marked **[added]**.

---

## 1. What the product is

A job-seeker's outreach console. It pulls internship / new-grad listings from
public GitHub job-board repos, and for any listing (or any company you type in)
it runs a browser agent that finds people at that company, drafts a personalised
LinkedIn referral note for each from your resume, and drafts an email to the
recruiting team. You edit the drafts, nudge them with AI, and track who you sent
to.

The persona in the seeded data: **Alex Rivera**, UC Berkeley '27 CS.

### Primary job of each screen

| Screen | Job |
|---|---|
| Jobs | Scan 14 listings, filter, see at a glance which ones you've already worked |
| Company search | Escape hatch when no listing exists — type a company, get general outreach |
| Job detail | Run the agent, then edit and send the drafts it produced |
| Profile | Supply the resume and highlight the AI writes from |

---

## 2. Visual language

Warm paper ground, near-black ink, one vermilion accent. Grotesque display type
set very tight and very heavy; monospace for anything machine-produced
(timestamps, repo paths, emails, log output, eyebrow labels). The split between
the two faces is the core device: **mono means "a machine wrote this"**.

Pill geometry throughout — an 18px radius on a 38px-tall input is nearly a
capsule, and that is the signature. Cards are 14px or 18px; interactive pills
are 20px; small inline badges are 3–4px.

### 2.1 Color tokens

Light (exact values from source):

| Token | Hex | Role |
|---|---|---|
| `--ground` | `#faf7f3` | page background |
| `--raised` | `#fffdfa` | header bar, dashed empty-state panel, note textarea fill |
| `--surface` | `#ffffff` | cards, table, inputs |
| `--toolbar` | `#fafaf7` | card footer / AI toolbar |
| `--row-hover` | `#f8f8f5` | table + list row hover |
| `--hair` | `#efefeb` | inner hairline; ghost-button hover fill |
| `--line` | `#e2e2dd` | card and header borders |
| `--line-strong` | `#d5d5cf` | input borders, secondary button border |
| `--line-chip` | `#dcdcd6` | preset chip border, AI prompt input border, "Not sent" pill border |
| `--line-dash` | `#cfcfc8` | dashed empty-state border |
| `--ink` | `#1b1b19` | primary text; solid dark button fill; terminal ground |
| `--ink-2` | `#45453f` | secondary text (location, field labels) |
| `--ink-3` | `#6a6a64` | muted text (meta, subheads) |
| `--ink-4` | `#8a8a83` | faint text (eyebrow labels, counters) |
| `--accent` | `#e2582b` | accent — links, primary button, active tab rule |
| `--accent-press` | `#c4461c` | primary button hover |
| `--accent-link-hover` | `#b23e17` | link hover |
| `--accent-bright` | `#ff8a5c` | accent on the dark terminal |
| `--accent-tint` | `#fde9e0` | avatar fill, accent chip fill |
| `--accent-tint-line` | `#f5c4ae` | "Replied" pill border |
| `--neutral-chip` | `#f0f0ec` | "Not collected" chip fill |
| `--term-bg` | `#1b1b19` | agent log panel |
| `--term-fg` | `#d9d9d2` | agent log text + cursor |
| `--term-track` | `#33332f` | progress track |
| `--solid-bg` / `--solid-fg` | `#1b1b19` / `#fff` | dark solid button |
| `--on-accent` | `#ffffff` | text on accent fill |

Semantic status (separate from the accent):

| State | fill | text | border |
|---|---|---|---|
| Collecting | `#fdf3dc` | `#8a6410` | — |
| Sent | `#eef3fb` | `#2a5aa8` | `#cddaf0` |
| Replied | `#fde9e0` | `#e2582b` | `#f5c4ae` |
| Not sent | `#ffffff` | `#6a6a64` | `#dcdcd6` |
| Not collected | `#f0f0ec` | `#6a6a64` | — |
| Over 300 chars | `#c0392b` | — | — |

**[added] Dark theme.** The source is light-only. A dark counterpart is defined
by redefining the same tokens — warm-neutral darks (hue-biased toward the
accent, never pure grey), accent lifted to `#ff7a4d` so it holds on a dark
ground, `--on-accent` dropped to `#20150f`, and `--solid-bg`/`--solid-fg`
inverted so the dark solid button becomes a light one. The terminal panel stays
dark in both themes — it is a terminal, and that is the point.

### 2.2 Type

- **Display + body:** Bricolage Grotesque, `opsz 12..96`, weights 400 / 500 / 600 / 800. Fallback `Helvetica, sans-serif`.
- **Machine / utility:** IBM Plex Mono, weights 400 / 500.

| Role | Size | Weight | Tracking |
|---|---|---|---|
| Page title (h1) | 52px / 1.0 | 800 | −0.035em |
| Empty-state title | 28px | 800 | −0.02em |
| Section head (h2) | 22px | 800 | −0.02em |
| Wordmark | 20px | 800 | −0.03em |
| Contact name | 15px | 600 | — |
| Body / table cell | 14px | 400 | — |
| Referral note (textarea) | 13.5px / 1.55 | 400 | — |
| Email body (textarea) | 13.5px / 1.6 | 400 | — |
| Meta, buttons | 13px | 400–500 | — |
| Terminal line | 12.5px / 1.9 | 400 (mono) | — |
| Small meta, chips | 12px | 400 | — |
| Eyebrow label | 11px uppercase | 400 (mono) | +0.06em |

Eyebrow labels are always mono, uppercase, `--ink-4`. The two body paragraphs
that can wrap awkwardly — the company-search intro and the empty-state copy —
get `text-wrap: pretty`. **[added]** Headings get `text-wrap: balance`; the
source does not set it.

### 2.3 Geometry

| Radius | Used for |
|---|---|
| 50% | avatars, wordmark dot, status dot |
| 3–4px | degree badge, confidence chip, row status chip |
| 14px | table card, collecting contact card, recents list |
| 18px | buttons, inputs, textareas, contact cards, email card, dashed panel, terminal panel |
| 20px | status pill, AI preset chips |

Control padding, which the radii alone don't pin down:

| Element | Padding |
|---|---|
| Ghost / outline button | `8px 14px` |
| Solid dark button | `9px 14px` |
| Accent primary button | `12px 20px` |
| AI preset chip | `3px 10px` |
| Status pill (clickable) | `4px 10px` |
| Row status chip | `3px 8px` |
| Terminal panel | `18px 20px`, `min-height: 320px` |
| Dashed empty-state panel | `56px 32px` |
| Card footer / AI toolbar | `10px 16px` |

Borders are 1px. No shadows anywhere — separation is carried by border + fill
only. Hairlines inside a card are `--hair`, with one exception: the jobs-table
header rule is `--line`, as is the degree badge's border. The card's own edge is
always `--line`.

### 2.4 Layout

- Content column: `max-width: 1240px`, side padding 28px.
- Header: 56px tall, sticky, `z-index: 5`, bottom border `--line`, fill `--raised`.
- Main: `padding: 32px 28px 64px`.
- Jobs table grid, with the Source column:
  `minmax(0,1fr) minmax(0,1.8fr) minmax(0,1.1fr) 64px minmax(0,1.4fr) 140px`
- Without it:
  `minmax(0,1fr) minmax(0,2fr) minmax(0,1.2fr) 64px 140px`
- Header row padding `10px 18px`; data row `14px 18px`; column gap 16px.
- Collecting layout: `repeat(auto-fit, minmax(340px,1fr))`, gap 20px.
- Done layout: `repeat(auto-fit, minmax(380px,1fr))`, gap 28px, `align-items: start`; the email column is `position: sticky; top: 80px`.
- Company search column: `max-width: 640px`. Profile column: `max-width: 720px`, gap 22px; the name/school pair is `repeat(auto-fit, minmax(220px,1fr))`, gap 14px.

**[added] Phone width (~400px).** The source relies on `auto-fit` and
`flex-wrap`, which handle the two-column regions, but the jobs table's fixed
grid does not collapse. Rules: h1 drops to 34px; the table becomes a stacked
card list below 760px (company + status on one line, role beneath, location /
posted / source as a mono meta line); the sticky email column un-sticks; side
gutter never below 16px; the page never scrolls horizontally.

---

## 3. Information architecture & state

### 3.1 Navigation

Three tabs: **Jobs**, **Company search**, **Profile**. Job detail is not a tab —
it inherits the tab of wherever you came from.

```
screen ∈ { jobs, company, job, profile }
prevScreen ∈ { jobs, company }      // set when a job is opened
```

A tab reads active when `screen === tab`, **or** when `screen === 'job'` and
`prevScreen === tab`. Active: text `--ink`, 2px bottom rule `--accent`.
Inactive: text `--ink-3`, transparent rule. The back link on job detail reads
"← All jobs" or "← Company search" from the same `prevScreen`.

Opening a job scrolls to top. Switching tabs scrolls to top.

Header right side, always visible: a 7px accent dot and mono text
`resume loaded · {profile.name}` — it updates live as you edit the profile name.

### 3.2 Per-job collection state

`data[jobId]` is absent, or `{status: 'collecting', step, contacts}`, or
`{status: 'done', contacts, email}`. This drives both the job-detail body and
the Outreach chip in the jobs table:

| `data[jobId]` | Chip |
|---|---|
| absent | `Not collected` (neutral) |
| collecting | `Collecting…` (warning) |
| done | `{n} people` (accent), plus ` · {k} sent` when any contact is past "Not sent" |

**Seeded state:** jobs `j0` (Stripe · Software Engineer Intern) and `j2` (Ramp ·
Software Engineer Intern) open already *done*, so the app's first screen shows
real worked rows rather than an empty shell.

---

## 4. Screens

### 4.1 Jobs

- h1 **Open roles**; sub: `{14} listings pulled from {4} GitHub repos · synced 4 min ago`.
- Top-right ghost button: **No listing? Search a company →**
- Filter row: search input (`Search role title…`, flex `1 1 240px`), **All companies** select, **All locations** select, and a `Clear` text button that appears only when at least one filter is set.
  - Companies and locations are the sorted unique values from the listing set.
  - Search matches `role + ' ' + company`, case-insensitive.
- Table card: mono uppercase header row — Company / Role / Location / Posted / Source / Outreach (Source hidden when `showRepoColumn` is off).
- Row: company (600 weight, ellipsised), role with the term beneath it in 12px `--ink-4`, location in `--ink-2`, posted in mono, repo path in mono and ellipsised, status chip. Whole row is a click target; hover fill `--row-hover`.
- Empty result: `48px 18px` of padding, "No listings match these filters.", and a solid dark button **Find connections at a company instead**.
  - That button does **not** go to the Company search screen. It runs a company search immediately on `companyFilter || query || 'Linear'` — creating the synthetic job and landing straight on job detail with `prevScreen = 'company'`.

Company searches never appear in this table: the row set is the 14 fixed
listings only. A synthetic company job is reachable solely through Recent
company searches or the back link.

### 4.2 Company search

h1 **Find connections by company**, then the paragraph:

> No posted listing? We'll find people at the company and draft general referral asks plus an email to their recruiting team.

Then a 44px input (`Company name, e.g. Linear`) and an accent **Find people**
button. Enter submits. Blank input does nothing.

Searching a company creates a synthetic job and prepends it to the recents list:

```js
{ id: 'co-' + name.toLowerCase(), company: name, role: 'General referral',
  location: 'Any location', posted: '', repo: '', term: '', hasListing: false }
```

The three empty strings matter — they are what makes the `hasListing: false`
meta branch safe to render. The input is then cleared and job detail opens with
`prevScreen = 'company'`.

Searching the same name again reuses the existing entry: it does not re-prepend,
does not reset anything already collected, and still clears the input.

Below, when any exist: **Recent company searches** — a card list of company name
plus its collection status.

### 4.3 Job detail

Header block: company in 14px / 500 `--ink-3`, role as the 52px h1, then
location and a mono meta line. Meta is `{term} · posted {posted} · via {repo}`
for a real listing, and `No listing — general referral outreach` for a company
search. Right side: **Re-run search** (ghost, only when done) and **Open
application ↗** (solid dark, only when the job has a listing).

**Re-run search discards work.** It rebuilds the whole done object from scratch,
so every edited note, the edited subject and body, and every contact status are
lost. The source gives no warning; a real build should confirm first.

**State: not collected.** A dashed-border panel on `--raised`: "No connections
collected yet", then:

> We'll open a browser, find people at {company} you can reach out to, draft a referral note for each using your resume, and look up a recruiter or HR email.

Then an accent **Collect connections & HR email** button, and a mono footnote
`takes ~1–2 min · uses your LinkedIn session`.

**State: collecting.** Two columns.

*Left* — the terminal panel: `--term-bg`, 18px radius, `18px 20px` padding,
`min-height: 320px`, mono 12.5px / 1.9. An eyebrow row reading `browser agent`
and the percentage, a 2px progress track filled in `--accent-bright` with a
0.4s width transition, the log lines (`✓` for completed, `›` for the line in
flight, both in `--accent-bright`), and a blinking block cursor
(`blink 1s step-end infinite`). **[added]** The blink and the bar transition are
disabled under `prefers-reduced-motion`; the source has no such guard.

Ten log lines, company interpolated:

```
Launching browser session
Signed in to LinkedIn
Searching "{Co}" employees · 1st, 2nd, alumni
Found 41 profiles — ranking by relevance to role
Checking alumni + mutual overlap with your profile
Drafting referral notes from your resume
Searching web for {Co} recruiting / HR emails
Verified email pattern first.last@{slug}
Drafting email to hiring team
Done
```

`{slug}` is the same lowercase-alphanumeric domain rule as §5 — `Scale AI`
becomes `scaleai.com`, not `scale ai.com`.

Timing: one step per tick — **Fast 350ms / Normal 700ms / Slow 1200ms**.
Contacts appear as the agent "finds" them: 0 while `step < 3`, then
`min(5, (step − 2) × 2)` — so 2, 4, 5, 5…

The tail of the run is more subtle than it looks:

- All ten lines are on screen at `step = 9`.
- One **further** tick is needed for `step` to reach 10 and trip the exit branch. So the real wait between the last line appearing and the flip to done is `tick + 500ms` — **850 / 1200 / 1700ms**, not 500ms.
- That final tick also re-renders at `step = 10`, which has two visible effects: every line gets a `✓` (nothing is left in flight), and `progress = round(step / 9 × 100)` evaluates to **111** — the bar overflows its track for the last half-second. See §8.

*Right* — eyebrow `People found · {n}` over compact contact cards (36px avatar,
name, title).

**State: done.** Two columns.

*Left* — **LinkedIn connections · {n}** with `{k} sent` on the right. One card
per contact (5 of them):

- 40px circular avatar, `--accent-tint` fill, accent initials (first letters of first two words).
- Name (15px/600), degree badge as a mono 11px bordered chip, title `{role} at {company}`, and a one-line accent reason (`UC Berkeley alum · CS ’21` — note the curly apostrophe — `3 mutual connections`, …).
  - Badges that actually render: `2nd`, `2nd`, `Alumni`, `3rd`, `2nd`. A sixth person carrying `1st` exists in the cast but is sliced off, so `1st` is unreachable.
- Status pill on the right, click-to-cycle: **Not sent → Sent → Replied → Not sent**, styled per the status table. Cycling updates the `{k} sent` counter and the job's row chip.
- The draft note in a 5-row textarea on `--raised`, editable.
- Counter beneath: `connection note` on the left, `{len}/300` on the right — `--ink-4`, turning `--danger` above 300. (LinkedIn's connection-note limit; the AI is told to stay under it.)
- Footer toolbar on `--toolbar`: preset chips **Shorter / Warmer / More formal / Mention my project** (hover: accent border + accent text), an **Ask AI to change this message…** input with a solid **Rewrite** button (Enter also runs it), then **Copy message** and **Open LinkedIn profile ↗**.

*Right, sticky* — **Email to hiring team**. A 56px label column: `To` (mono
address plus an accent confidence chip, e.g. `pattern verified · 86%`), `Name`
(`Diego Alvarez · Technical Recruiter`), and `Subject` as a borderless inline
input. Then the body as a 13-row borderless textarea. Footer toolbar with presets
**Shorter / More enthusiastic / More formal / Add a question**, the AI prompt
input (`Ask AI to change this email…`, distinct from the note card's
`Ask AI to change this message…`) + **Rewrite**, and an accent
**Open in mail app** (a real `mailto:` with
subject and body URL-encoded) beside a bordered **Copy**. Below the card, a 12px
`--ink-4` note: "Found via company careers page + email pattern check. {name}'s
resume will be attached."

### 4.4 Profile

h1 **About you**, sub "The AI uses this to write every referral note and email."
Fields: **Name** and **School / background** side by side, **One-line highlight
to mention** full width, **Resume (paste text)** as a 12-row mono textarea.
Footnote: "Saved automatically." Edits take effect immediately — they change the
header's `resume loaded · {name}` and every draft generated from then on.

---

## 5. Draft generation

**Referral note** — one sentence of identity, one of ask, one of proof:

```
Hi {First}, I'm {name} ({school up to the first comma}). {ask} and would be
grateful for a referral if you're comfortable. I recently {highlight}.
Thanks either way!
```

`{ask}` is `I'm applying for the {role} role at {company}` for a real listing,
and `I'm hoping to join {company} as a software engineer` for a company search.

**Email to recruiting** — verbatim, `\n` shown as line breaks:

```
Hi {company} Recruiting team,

I'm {name}, {school}. I'm reaching out about {about} and wanted to introduce
myself directly.

Last summer at Brex I shipped a card-controls API used by 400+ customers and
cut p95 latency on spend-limit checks by 38%. On the side, I {highlight}.

I'd love to bring that same ownership to {company}. My resume is attached —
happy to share more or chat whenever works.

Best,
{name}
```

`{about}` is `the {role} position` for a real listing and
`software engineering opportunities` for a company search.

Note that the third paragraph is **hardcoded** — the Brex role, the "400+
customers" and the "38%" are string literals, not derived from
`profile.resume`. Only `name`, `school` and `highlight` flow from the profile.

Subject is `{role} — {name}`, or `Software Engineering at {company} — {name}`
with no listing.

**Recipient** — `diego.alvarez@{company-slug}.com`, where the slug is the
company name lowercased with all non-alphanumerics stripped. Confidence reads
`pattern verified · 86%`.

### 5.1 AI rewrite

Each draft has its own rewrite control keyed `{jobId}:{contactId}` or
`{jobId}:email`. Running one sets its button to **Rewriting…**, and clears the
prompt box when the run ends — unconditionally, including every fallback path.

The prompt sent to the model carries: the instruction, the sender's name,
school, highlight and full resume, the current message, "keep it truthful to the
sender's background", the 300-character limit for connection notes only, and
"return ONLY the rewritten message, no preamble."

**[added] Implementation binding.** The source calls `window.claude.complete`,
which does not exist on this runtime. The published page uses the `sample`
capability instead — `const sample = await claude.use("sample")`,
`await sample(prompt, {modelTier: 'quick', cache: false, signal})`. `null` from
`use()`, or a rejection, falls through to the local rewriter below; `not_granted`
hides nothing but silently uses the local path. `cache: false` because "Rewrite"
must produce a new answer each time.

**Local fallback** (also the offline behaviour), applied after a ~600ms delay so
the control still reads as work being done. Four substring rules on the
lowercased instruction, applied in order and cumulatively:

| Match | Effect |
|---|---|
| `short` | keep the first two sentences, append `" Thanks!"` |
| `formal` | leading `Hi ` → `Hello ` (anchored to string start only); `"Thanks either way!"` → `"Thank you for your time and consideration."`; `I'm ` → `I am ` globally — **that one contraction only**, nothing else |
| `warm` / `friend` | append `, hope your week's going well!` to the greeting |
| `project` | insert `I can share a quick demo of PairPad if helpful. ` before the first `Thanks` |

**Two of the four email presets are no-ops locally.** The note presets all hit a
rule (`Shorter`→`short`, `Warmer`→`warm`, `More formal`→`formal`, `Mention my
project`→`project`), but on the email card only `Shorter` and `More formal`
match. **More enthusiastic** and **Add a question** return the text byte-identical
whenever the model is unavailable — the button cycles through **Rewriting…** and
nothing changes. A real build needs either rules for them or an honest
"couldn't reach the model" state.

### 5.2 Copy

**Copy message** / **Copy** write to the clipboard and swap the label to
**Copied ✓** for 1500ms, then revert. Clipboard failures are swallowed — the
label still confirms, because the draft is visible and selectable either way.

---

## 6. Configuration

Two props the design exposes through `data-props` as editor controls (`enum` and
`boolean`). **[added]** The implementation surfaces them as a small settings
strip in the page footer; the source specifies no in-page control.

| Prop | Type | Default | Effect |
|---|---|---|---|
| `collectSpeed` | `Fast` / `Normal` / `Slow` | `Normal` | 350 / 700 / 1200ms per agent log step |
| `showRepoColumn` | boolean | `true` | Shows the Source column and switches the table grid |

---

## 7. Acceptance criteria

1. Jobs opens with 14 rows; `j0` and `j2` already show accent `5 people` chips.
2. Typing `intern` filters to intern roles; a company or location select narrows further; `Clear` appears only while a filter is set and resets all three.
3. Filtering to nothing shows the empty state, and its button lands directly on the **job detail** page for a synthetic company job named after the current company filter (else the query, else `Linear`) — not on the Company search screen.
4. Clicking any uncollected row → job detail → **Collect connections & HR email** runs all 10 log lines at the configured speed, contacts stream in 2 → 4 → 5, every line ends with a `✓`, and the view flips to done one tick + 500ms after the last line appears (850 / 1200 / 1700ms by speed).
5. Returning to Jobs shows that row's chip as `5 people`; cycling a contact to **Sent** makes it `5 people · 1 sent`.
6. A status pill cycles Not sent → Sent → Replied → Not sent with the right fill, text and border at each stop.
7. Editing a note updates `{len}/300` live and turns it red past 300.
8. A preset chip or a typed instruction rewrites the draft in place; the button reads **Rewriting…** while it runs. With the model unavailable, the four note presets and the email's **Shorter** / **More formal** each produce a visibly different message. (**More enthusiastic** and **Add a question** are expected no-ops on the local path — see §5.1.)
9. **Open in mail app** produces a `mailto:` carrying the current subject and body, including unsaved edits.
10. Company search for a name with no listing opens a detail page whose meta reads "No listing — general referral outreach" and whose drafts use the "hoping to join" phrasing; the name appears under Recent company searches.
11. Editing the profile name changes the header line and the next drafts generated.
12. Nav tab underline follows `prevScreen` when a job is open; back link reads "All jobs" or "Company search" to match.

These three test **[added]** work, not source behaviour:

13. The progress bar never exceeds 100% of its track (the source reaches 111% — see §8).
14. At 400px wide nothing scrolls horizontally, the table reads as stacked cards, and every control stays tappable.
15. Both themes render legibly; the terminal panel stays dark in both; `prefers-reduced-motion` stops the cursor blink and the bar transition.

---

## 8. Known gaps in the source

Worth flagging before this becomes real:

- **The Open application link is `href="#"`.** Listings carry no URL in the data model; a real build needs one per job.
- **Contacts are per-job, not per-company.** Two listings at the same company collect the same five people twice and track their statuses independently.
- **People are a fixed cast of six, five of whom are used.** The reason strings (`UC Berkeley alum · CS '21`) are hardcoded and do not derive from the profile, so changing your school does not change the stated overlap.
- **Email recipient is always Diego Alvarez** at the company's slug domain, "86% verified" regardless of company.
- **Nothing persists.** Reloading loses every draft, status and profile edit.
- **Status is a manual three-stop cycle** with no timestamps, so "1 sent" is a self-reported count, not a record.
- **The progress bar overshoots to 111%.** `round(step / 9 × 100)` is evaluated once more at `step = 10`, and the fill div has no clamp and sits in a track with no `overflow: hidden` — so for the last ~500ms of a run the bar spills past the panel's rounded edge. The implementation clamps it to 100; this is the one place it knowingly diverges from the source.
- **The email's proof paragraph is hardcoded.** The Brex sentence ignores `profile.resume` entirely, so it will openly contradict any resume you paste. Same defect class as the hardcoded overlap reasons, but far more visible.
- **Re-run search silently destroys every edit** — notes, subject, body and all contact statuses — because it rebuilds the done object from scratch.
- **Two email presets do nothing without the model.** `More enthusiastic` and `Add a question` match no local rewrite rule, so they fail silently rather than reporting that the model was unreachable.
- **Company searches never reach the jobs table**, so there is no single list of everything you are working on.
