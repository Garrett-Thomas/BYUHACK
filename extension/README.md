# Warmline LinkedIn capture (Chrome extension)

Saves the LinkedIn people you view into your local Warmline server (`POST /api/v1/connections`).

## Build and load

```
cd extension
npm install
npm run build     # type-checks, bundles with esbuild, copies static/ into dist/
npm test          # extractor tests against the anonymized fixtures
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist`.

## Configure

Open the extension's options page. Defaults: server URL `http://127.0.0.1:3001`, capture on.
There is no token (the server has no authentication). A non-local `https://` server URL prompts for
that host's permission; non-local `http://` is rejected. The page also shows the retry queue count and
the count of dropped (failed) items, with **Retry now** and **Clear queue**.

## What it captures

Only on `https://www.linkedin.com/in/*` and `/search/results/people/*`, once per page visit (the
href is polled every second to catch single-page-app navigation; extraction waits up to 8s for the page
to render). Structured fields only, never HTML: name, profile URL, headline, location, company (the
headline text after " at ", else null), `extractorVersion` `1.0.0`. It never clicks, scrolls or paginates.

Failed sends (network error, 429, 5xx) are queued in `chrome.storage.local` with their
Idempotency-Key and retried every 5 minutes. Other 4xx responses are dropped and counted as failed.

## Fixtures

`fixtures/people-search.html` keeps the DOM structure of a real saved LinkedIn search page with all
personal data replaced by fake values. `fixtures/profile.html` is synthetic (no real profile page was
available); its selectors are guesses based on LinkedIn conventions.
