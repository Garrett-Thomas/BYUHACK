# Warmline LinkedIn capture (Chrome extension)

Saves the people at a company on LinkedIn, scoped by LinkedIn's Current company filter, into your local Warmline server (`POST /api/v1/connections`). The first time, you link the Warmline company to its LinkedIn company page with a button this extension shows there.

## Build and load

```
cd extension
npm install
npm run build     # type-checks, bundles with esbuild, copies static/ into dist/
npm test          # extractor, tab-registration and save-button tests
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist`.

## Configure

Open the extension's options page. Defaults: server URL `http://127.0.0.1:3001`, capture on.
There is no token (the server has no authentication). A non-local `https://` server URL prompts for
that host's permission; non-local `http://` is rejected. The page also shows the retry queue count and
the count of dropped (failed) items, with **Retry now** and **Clear queue**.

## What it does

Warmline links a job's company to its LinkedIn company page once, then saves the people on
company-scoped LinkedIn searches that you open from Warmline into your local Warmline server
(`POST /api/v1/connections`). LinkedIn's real **Current company** filter is used, never a keyword
search. Nothing else you browse on LinkedIn is read or saved, and profile pages (`/in/*`) are not read
at all.

### Linking a company (once per company)

1. In Warmline, click **Find {company} on LinkedIn**. It opens a LinkedIn company search with
   `warmline=<company>&wl_mode=company`. The extension registers that tab in **company mode**; nothing
   is captured on the search page.
2. Click into the right company. On its `/company/<slug>/` page, in that tab only, the extension shows
   a button at the top right: **Save "<LinkedIn name>" as "<Warmline company>"** (with a x to
   dismiss it). It is re-shown when you move to another company page in the same tab. If the page has
   no "N employees" link (`main a[href*="currentCompany"]`) within 10s, the button is disabled and
   says "LinkedIn doesn't list employees for this page".
3. Click it. The background worker reads the company ids from that employees link and saves
   `{linkedinSlug, linkedinName, linkedinIds}` with `PUT /api/v1/company-scopes/<company>`. On success the tab
   switches to **people mode** and the page goes to the 1st + 2nd degree people search scoped to those ids
   (`location.replace`, the only navigation the extension ever makes). If the server cannot be reached,
   the button says "Couldn't reach Warmline - is the server running?" and stays clickable.

Warmline's later links are the scoped people searches directly
(`.../search/results/people/?currentCompany=[ids]&network=["F"|"S"|"O"]&origin=COMPANY_PAGE_CANNED_SEARCH&warmline=<company>`).

### Which pages the extension acts on

Registrations live in `chrome.storage.session`, keyed by tab id, expire after 2 hours, and are removed
when the tab closes. A registration is `{mode: 'company', company, registeredAt}` or
`{mode: 'people', company, ids, registeredAt}`. The content script runs at `document_start` so it can
read the `warmline` marker before LinkedIn's single-page app rewrites the URL, and it re-checks on
single-page-app navigation by polling the href every second.

- **Company search** URL with `warmline` and `wl_mode=company`: registers the tab in company mode.
- **People search** URL with `warmline` and `currentCompany`: registers the tab in people mode with
  those ids (this covers the direct links).
- **`/company/<slug>/` pages:** the Save button is injected only in company-mode tabs.
- **People searches:** captured only in people-mode tabs whose URL's `currentCompany` ids equal the
  registered ids (order does not matter). So pages 2, 3 and so on that you click through are saved even
  if LinkedIn drops the marker, while any other search in that tab is not. Unscoped people searches,
  including keyword searches, are never captured.
- **Everything else** on LinkedIn: no extraction, and no messages to the background worker.

Once capture is approved, extraction waits up to 15s for results to render, then runs once per page
visit. The extension never clicks, scrolls or paginates.

What is saved per person (structured fields only, never HTML): name, profile URL, headline, location,
`degree` (`1st`, `2nd` or `3rd`; `3rd+` is stored as `3rd`), `company`, `mutuals` and `mutualCount`, and `extractorVersion` `1.3.0`.
For 2nd-degree people, `mutuals` is the up to two named, linked mutual connections from the card's mutual line
(the smallest element whose text matches "mutual connection") and `mutualCount` is the named mutuals plus
"& N other"; a 2nd-degree person with no linked mutual is not saved. 1st and 3rd degree send `[]` and `null`.
`company` is the Warmline company from the tab's registration, assigned by the background worker, not
parsed from the headline. "LinkedIn Member" results are skipped.

Failed sends (network error, 429, 5xx) are queued in `chrome.storage.local` with their
Idempotency-Key and retried every 5 minutes. Other 4xx responses are dropped and counted as failed.

## Fixtures

`fixtures/people-search.html` keeps the DOM structure of a real saved LinkedIn search page with all
personal data replaced by fake values. Every card has a degree; it includes 3rd-degree and `3rd+`
cards (kept, as `3rd`) and a "LinkedIn Member" card (skipped).

`fixtures/company-page.html` is a fake company page: one employees link inside `<main>`, plus decoy
`urn:li:company:N` ids and `currentCompany` links outside it that must be ignored.
