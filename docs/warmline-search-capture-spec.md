# Search Capture Initiated From Top of the Stack — Spec

Status: **approved**
Builds on: `docs/connections-integration-spec.md` (already implemented). This spec replaces that one's passive capture model.

## Goal

The user clicks a link in Top of the Stack. It opens a LinkedIn people search filtered to their **1st- and 2nd-degree connections** at the job's company. The extension saves the people on that search, and on further pages of it that the user clicks through, then attributes them to that company. Nothing else the user browses on LinkedIn is read or saved. The Top of the Stack job screen picks up the new people on its own.

## Decisions (from the user)

| # | Decision |
|---|---|
| S1 | **Company filter:** keyword + network. The link searches the company name with LinkedIn's `network=["F","S"]` filter. No company-ID lookup. |
| S2 | **Capture trigger:** automatic, but only in tabs opened from a Top of the Stack link. All other LinkedIn pages are ignored: not extracted, not sent. |
| S3 | **Pagination:** the user clicks next page themselves. Each page they open in that search is saved. The extension never clicks, scrolls or paginates. |
| S4 | **Refresh:** after the link is clicked, the job screen polls the server and new people appear on their own. |

## Defaults (proposed by me, not yet objected to)

| # | Decision |
|---|---|
| S5 | Everyone saved from a Top of the Stack search gets `company` = the company in the link, not a value parsed from their headline. |
| S6 | Degree (`1st` / `2nd`) is stored per connection and shown on the contact card's degree chip. 3rd-degree and "LinkedIn Member" results are skipped even if they appear. |
| S7 | Capture from profile pages (`/in/*`) is removed. Only search pages are read. |
| S8 | Rows already in the database are left untouched. |

## The link

Built by the frontend's `linkedInPeopleUrl(company)`:

```
https://www.linkedin.com/search/results/people/
  ?keywords=<company>
  &network=%5B%22F%22%2C%22S%22%5D        // ["F","S"] = 1st + 2nd degree
  &origin=FACETED_SEARCH
  &warmline=<company>                      // marker the extension looks for
```

Every value is `encodeURIComponent`-encoded. It opens in a new tab (`target="_blank" rel="noopener"`).

## Extension changes

### Tab registration

- `manifest.json`: the content script runs at `document_start`, so it can read the `warmline` marker before LinkedIn's single-page app rewrites the URL. It still waits for results to render before extracting.
- **Registering a tab:** on a people-search URL with a non-empty `warmline` param, the content script sends `{ type: 'register', company, keywords }`. The background stores `tabId -> { company, keywords, registeredAt }` in `chrome.storage.session`.
- **Deciding whether to capture:** on every people-search visit (initial load and single-page-app navigation, as today), the content script first asks the background `{ type: 'shouldCapture', keywords }`. The background answers with the company only if:
  - this tab is registered,
  - it was registered less than 2 hours ago,
  - and `keywords` matches the registered keywords, ignoring case and trimming.

  Otherwise the answer is `null`, and the content script does nothing: no extraction, no messages.
- So pages 2, 3 and so on of the same search in that tab are captured even if LinkedIn drops the `warmline` param. Searching for something else in that tab stops capture.
- Remove the registration when the tab closes (`chrome.tabs.onRemoved`). That event needs no `tabs` permission.

### Extraction

- `extractSearchResults` additionally returns `degree`, parsed from the name text (`• 1st`, `• 2nd`, `• 3rd+`) before it is stripped. Records whose degree isn't `1st` or `2nd` are dropped.
- `company` is set by the background from the tab registration (S5). The extractor no longer derives it.
- Remove the profile extractor, its fixture, its tests and the `profile` page kind (S7).
- `extractorVersion` becomes `"1.1.0"`.
- Update the people-search fixture so every card has a degree, including at least one 3rd-degree and one "LinkedIn Member" card that must be skipped. Keep it fake-data only.

### Options and README

The options page gains one line explaining that only searches opened from Top of the Stack are saved. Update the README's "What it captures" section to match.

## Server changes

- **Migration 2:** `ALTER TABLE connections ADD COLUMN degree TEXT` (nullable).
- **Ingestion schema:** add an optional `degree`, nullable, one of `"1st" | "2nd" | "3rd"`. Return it on every connection. Upsert overwrites it.
- **Company matching:** unchanged. Exact normalized match is now enough, because Top of the Stack captures carry the link's company verbatim.
- Update `openapi.ts` and the tests: degree round-trip, an invalid degree gives 422, and migration 2 applies on an existing v1 database.

## Frontend changes

- **`linkedInPeopleUrl`:** builds the link above.
- **Contact mapping:** `degree` = `connection.degree ?? 'Saved'`.
- **Email state:** the done state's `email` becomes `Email | null | 'idle'`. `'idle'` means the email search hasn't run yet. In that state the email column shows a **Find recruiting email** button, which runs only the email branch (find-contact, then draft-email) using the existing retry machinery.
- **Clicking "Find people on LinkedIn ↗"** (header or empty state):
  - If the job has no data yet, set it to `{ status: 'done', contacts: [], email: 'idle', err: {...nulls}, busy: {...false} }`. Don't trigger the paid email search.
  - Start polling `getConnections(company)` every 5 seconds for up to 10 minutes. Stop when the user leaves the job screen or the time runs out.
  - Merge results into `contacts` by id. New people are appended. Existing contacts keep their edited note text and outreach status, but get updated name, headline and degree.
- **"Collect connections & HR email"** still runs both branches, as today.
- **Polling indicator:** while polling, the contacts section header shows a small `checking LinkedIn for new people…` line, reusing the existing `eyebrow` style.
- **Polling cleanup:** keep the poll timer in a ref or effect owned by the job screen, cleared on unmount and when the job changes. Polling results go through the same run-id guard as collect, so a Re-run supersedes them.

## Testing

- **Automated:**
  - `server`: typecheck plus tests.
  - `extension`: build plus tests, including the registration logic as a pure function (`shouldCapture(registration, keywords, now)`) and the degree filter.
  - `frontend`: build.
- **Browser (Sonnet agent with Claude in Chrome, after the code lands):**
  1. Open the Top of the Stack frontend at `http://localhost:5173`, pick a job, and click **Find people on LinkedIn ↗**.
  2. In the LinkedIn tab, confirm the search shows the 1st/2nd filter. Wait for the capture, then open page 2 once.
  3. Confirm through the server API that new rows have the job's company and a `1st`/`2nd` degree.
  4. Confirm the Top of the Stack job screen shows them without a manual re-run.
  5. Open an unrelated LinkedIn people search by hand and confirm nothing new is saved.
  6. Do not click Collect or Find recruiting email (they make paid Claude calls). Keep total LinkedIn page views under about 10.

  This uses the user's real server and database, since saving these people is the intended outcome.

## Agent breakdown

As before: three Sonnet agents in parallel (`server/`, `extension/`, `frontend/`), working against the contracts above. Then I review, run the checks and commit. Then one Sonnet agent runs the browser test.
