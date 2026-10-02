# Warmline LinkedIn capture (Chrome extension)

Saves the people on LinkedIn searches that you open from Warmline into your local Warmline server (`POST /api/v1/connections`).

## Build and load

```
cd extension
npm install
npm run build     # type-checks, bundles with esbuild, copies static/ into dist/
npm test          # extractor and tab-registration tests
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist`.

## Configure

Open the extension's options page. Defaults: server URL `http://127.0.0.1:3001`, capture on.
There is no token (the server has no authentication). A non-local `https://` server URL prompts for
that host's permission; non-local `http://` is rejected. The page also shows the retry queue count and
the count of dropped (failed) items, with **Retry now** and **Clear queue**.

## What it captures

Only LinkedIn people searches opened from a Warmline link ("Find people on LinkedIn"). Nothing else
you browse on LinkedIn is read or saved: on any other page the extension extracts and sends nothing,
and profile pages (`/in/*`) are not read at all.

How a tab is chosen:

- The Warmline link carries a `warmline=<company>` marker. The content script runs at `document_start`
  so it can read the marker before LinkedIn's single-page app rewrites the URL, and registers the tab
  with the background worker (`chrome.storage.session`, keyed by tab id, with the company, the search
  `keywords` and the time).
- On every people-search visit in that tab (initial load and single-page-app navigation, detected by
  polling the href every second) the content script asks the background whether to capture. The answer
  is yes only if the tab is registered, the registration is under 2 hours old, and the search `keywords`
  match the registered ones (ignoring case and extra whitespace). So pages 2, 3 and so on that you click
  through are saved even if LinkedIn drops the marker, while searching for something else in that tab
  stops capture. The registration is removed when the tab closes.
- Once capture is approved, extraction waits up to 15s for results to render, then runs once per page
  visit. It never clicks, scrolls or paginates.

What is saved per person (structured fields only, never HTML): name, profile URL, headline, location,
`degree` (`1st` or `2nd`), `company` and `extractorVersion` `1.1.0`. `company` is the company from the
Warmline link, assigned by the background worker, not parsed from the headline. 3rd-degree results and
"LinkedIn Member" results are skipped.

Failed sends (network error, 429, 5xx) are queued in `chrome.storage.local` with their
Idempotency-Key and retried every 5 minutes. Other 4xx responses are dropped and counted as failed.

## Fixtures

`fixtures/people-search.html` keeps the DOM structure of a real saved LinkedIn search page with all
personal data replaced by fake values. Every card has a degree; it includes 3rd-degree, `3rd+` and
"LinkedIn Member" cards that must be skipped.
