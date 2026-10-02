# Degree Sections + Company-Scoped Search — Spec

Status: **approved**
Builds on: `docs/warmline-search-capture-spec.md` (implemented in `9804cb5`).

## Goals

1. **Degree sections.** Show saved people in three labeled sections, in priority order: 1st-degree, 2nd-degree, then everyone else. Each section has its own LinkedIn link, and the drafted note fits the relationship.
2. **Company scope.** People searches use LinkedIn's real **Current company** filter, never a keyword search. The user links a Top of the Stack company to its LinkedIn company page once, by clicking a button the extension shows on that page, and the IDs are cached on the server.

## What I verified in the browser

Checked on 2026-10-02 in the user's logged-in Chrome:

- **Company page** `linkedin.com/company/google/`:
  - Inside `<main>` there is exactly one `a[href*="currentCompany"]`. It's the "10K+ employees" link, and its URL carries `currentCompany=["1441","16140","17876832","791962"]`: Google plus its subsidiaries. That's LinkedIn's own scope for "people who work here", so it's what we use.
  - The page also contains many other `urn:li:company:N` / `fsd_company:N` IDs (Microsoft 1035, Amazon 1586, from sidebars). Don't scrape URNs from the HTML; use only the employees link.
- **Company search** `linkedin.com/search/results/companies/?keywords=Stripe`:
  - Results link to `/company/<slug>/` (`stripe`, `recko`, `stripecc` …). They don't expose IDs.
  - Names are ambiguous: "STRIPE" the biotech company is the third result. So the user must pick the company.
- **`linkedin.com/<name>` is not a company URL.** Company pages live at `/company/<slug>/`, and the slug is not reliably derivable from the name.

## Part A — Degree sections

### Extension
- Keep 3rd-degree people: both `3rd` and `3rd+` are stored as `"3rd"`.
- Still skip "LinkedIn Member" cards, since they have no name or profile URL.
- `extractorVersion` becomes `"1.2.0"`.
- Update the fixture/tests: the 3rd-degree card is now kept, and the "LinkedIn Member" card is still skipped.

### Frontend
These apply once a company scope exists. See Part B for the no-scope state.

- **Grouping.** The contacts column shows three sections, always rendered in this order:
  1. **1st-degree connections:** "Ask for a referral directly."
  2. **2nd-degree connections:** "Reach them through a mutual connection."
  3. **Other people at {company}:** 3rd-degree, plus older rows with no degree.
- **Section layout:**
  - Each section header shows its count and a **Find on LinkedIn ↗** link for that degree only: `network=["F"]`, `["S"]` or `["O"]`, scoped with `currentCompany`.
  - An empty section shows a one-line message and its link instead of cards.
- **Order.** Within a section, newest first by `updatedAt`.
- **Header button.** **Find people on LinkedIn ↗** is the 1st-degree link.
- **Polling.** Every one of these links starts polling (same 5s / 10 min rules as today).
- **Degree chip.** `1st` / `2nd` / `3rd`, with `Saved` when the degree is null.
- **Drafted note** (`draftNote`) depends on the degree, and stays under 300 characters:
  - **1st:** the current referral ask.
  - **2nd:** asks whether they'd point the sender to the right person on the team, or share a quick perspective on the role.
  - **3rd / unknown:** a short cold intro that mentions the role and the highlight, and asks for 10 minutes of their time.
- **Removed:** the single combined "LinkedIn connections" list and its empty state.

## Part B — Company scope

### Flow

1. **No saved scope.**
   - Top of the Stack shows no degree links. Instead:
     - the contacts area shows a single **Find {company} on LinkedIn ↗** button and the line "Pick the right company on LinkedIn once, and Top of the Stack will remember it";
     - the header's people button is replaced by the same Find button.
   - Clicking it opens company search in a new tab and starts polling:
     `https://www.linkedin.com/search/results/companies/?keywords=<company>&warmline=<company>&wl_mode=company`
2. **The extension registers the tab** as `{ mode: 'company', company, registeredAt }`. Nothing is captured on the search page. The user clicks into a company.
3. **On `/company/<slug>/…` in that registered tab,** the content script injects a fixed-position button: **Save "<LinkedIn name>" as "<Top of the Stack company>"**.
   - `<LinkedIn name>` comes from the page's `h1` (falling back to `document.title` minus " | LinkedIn" and any leading "(N) ").
   - Style it inline: high z-index, bottom-right, with a small × to dismiss. No external CSS.
   - It is re-injected on single-page-app navigation to another company page in the same tab, so the user can look at several before choosing.
   - If `main a[href*="currentCompany"]` doesn't appear within 10s, show the button disabled, reading "LinkedIn doesn't list employees for this page".
4. **When the user clicks Save:**
   1. Parse the IDs from the employees link.
   2. Send `{ type: 'saveCompany', slug, linkedinName, ids }` to the background.
   3. The background calls `PUT /api/v1/company-scopes/:company`.
   4. On success, the background switches the tab's registration to people mode with `scope = { ids }`, and the content script calls `location.replace(...)` with the 1st-degree scoped people search:
      `https://www.linkedin.com/search/results/people/?currentCompany=<ids JSON>&network=["F"]&origin=COMPANY_PAGE_CANNED_SEARCH&warmline=<company>`
   5. On failure, the button shows "Couldn't reach Top of the Stack — is the server running?" and stays clickable.
5. **That people search is captured as today,** and every record gets `company` = the Top of the Stack company.
6. **Top of the Stack picks up the change.** Polling also re-fetches the scope, so the company line and the three degree sections appear on their own.

**With a saved scope**, every Top of the Stack people link is the direct scoped URL:

`https://www.linkedin.com/search/results/people/?currentCompany=<ids JSON>&network=["F"|"S"|"O"]&origin=COMPANY_PAGE_CANNED_SEARCH&warmline=<company>`

**Wrong company.** Under the job header, when a scope exists, show a muted line: `LinkedIn company: <linkedinName or slug> · change`.
- **change** calls `DELETE /api/v1/company-scopes/:company`, then clears the scope locally, which brings back the Find button.
- Style **change** like the existing text links.

### Which pages the extension acts on

- **Registration.** Registrations live in `chrome.storage.session`, keyed by tab id. They expire after 2 hours and are removed on `tabs.onRemoved`. A registration is either:
  - `{ mode: 'company', company, registeredAt }`, or
  - `{ mode: 'people', company, ids, registeredAt }`.
- **How a tab registers:**
  - A company-search URL with `warmline` and `wl_mode=company` registers the tab in company mode.
  - A people-search URL with `warmline` and `currentCompany` registers it in people mode, with `ids` taken from that param. This covers the direct links.
- **Company pages:** show the Save button only in company-mode tabs.
- **People searches:** captured only in people-mode tabs whose URL's `currentCompany` set equals the registered `ids` (order-insensitive).
- **The keyword-search branch is removed.** Unscoped people searches are never captured.
- **Everything else** on LinkedIn: no extraction, no messages beyond the registration check.
- Keep the decisions pure and unit-tested:
  - `shouldCapture(registration, url, now)`
  - `showSaveButton(registration, url, now)`
  - `parseEmployeesLinkIds(doc)`, tested against a new fake fixture `fixtures/company-page.html` with decoy `urn:li:company` IDs that must be ignored.
- **The only navigation the extension performs** is the single `location.replace` after the user clicks Save. It never clicks, scrolls or paginates.

### Server
- **Migration 3:** `company_scopes(normalized_company TEXT PRIMARY KEY, company TEXT NOT NULL, linkedin_slug TEXT, linkedin_name TEXT, linkedin_ids TEXT NOT NULL /* JSON array of digit strings */, resolved_at TEXT NOT NULL)`.
- **`GET /api/v1/company-scopes/:company`:** returns `200 { company, linkedinSlug, linkedinName, linkedinIds, resolvedAt }`, or 404.
- **`PUT /api/v1/company-scopes/:company`:**
  - Body: `{ linkedinSlug?: string|null, linkedinName?: string|null, linkedinIds: string[] }`, where `linkedinIds` has 1–50 entries, each matching `^\d{1,15}$`.
  - Upserts the row and returns 200 with the record. Invalid input gives 422.
- **`DELETE /api/v1/company-scopes/:company`:** returns 204, or 404.
- `:company` is URL-decoded and normalized with the existing `normalizeCompany`.
- No auth. Update `openapi.ts` and the tests: round-trip, 422 cases, 404/204, normalization ("Stripe, Inc." and "stripe" are the same row), and migration 3 applying to a v2 database that has rows.

### Frontend
- **Fetching the scope.** On opening a job screen, call `getCompanyScope(company)`, where a 404 means `null`. Re-fetch it on every poll tick.
- **`deleteCompanyScope(company)`** for **change**.
- **Link builders** in `lib/format.ts`:
  - `linkedInCompanySearchUrl(company)`
  - `linkedInPeopleUrl(company, network: 'F' | 'S' | 'O', ids: string[])`
- **No-scope state.** Show the Find-company state described in the flow, whether the job has no data yet or is already done. Clicking Find also calls `ensureIdle` and starts polling, as today.

## Testing

- **Automated:**
  - `server`: typecheck plus tests.
  - `extension`: build plus tests (sections A and B, fixtures fake-only).
  - `frontend`: build.
- **Browser (Sonnet agent, after merge):**
  1. Use a job at a company with no saved scope, and click **Find {company} on LinkedIn**.
  2. Click the correct company. Confirm the Save button appears with the right names, and click it.
  3. Confirm the redirect to a people search with `currentCompany` and `network=["F"]`.
  4. Confirm a `company-scopes` row exists and that new connections carry the job's company and degree `1st`.
  5. In Top of the Stack, confirm the scope line and the three sections appear and the 1st-degree section fills in.
  6. Click the 2nd-degree link and confirm it goes directly to the scoped people search.
  7. Open a company page by hand in a normal tab and confirm no Save button appears.
  8. Don't click the paid email buttons. Stay under about 12 LinkedIn page views.

## Agent breakdown

Same as before: three Sonnet agents in parallel (`server/`, `extension/`, `frontend/`). Then I review, run the checks and commit. Then the browser test.
