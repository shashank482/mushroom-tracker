# Mushroom Market Tracker — Hosted Weekly Automation (Design)

## Purpose

Turn the existing manual mandi-price tracker (run by hand with `node run.js`,
viewed by double-clicking a local HTML file) into something that updates
itself weekly and is reachable from a phone or any browser, without
introducing a server to maintain or expanding scope beyond Stage 1
(mandi/wholesale prices).

## Non-goals

- Retail prices, Google Trends, export data, cost comparison, or weekly
  notes (later stages) — out of scope for this change.
- Authentication or multi-user access — single owner, no login.
- A database — the existing JSONL flat-file history stays as-is.

## Architecture

A public GitHub repository (`shashank482/mushroom-tracker`) holds the
existing Node scripts unchanged, plus one new GitHub Actions workflow. The
workflow runs on a weekly cron schedule (and can be triggered manually from
GitHub's UI), executes `node run.js` exactly as today, then commits the
updated data file and regenerated HTML back to the repo. GitHub Pages
serves that HTML as a live, publicly reachable site.

## Components

- **Unchanged**: `collect-mandi.js`, `generate-summary.js`, `run.js`,
  `generate-sample-data.js`, `config.js`.
- **New**: `.github/workflows/weekly-collect.yml` — scheduled + manually
  dispatchable Actions workflow.
- **Changed**: `config.summaryFile` renamed from `summary.html` to
  `docs/index.html`, so GitHub Pages (configured to serve from
  `main`/`docs`) publishes it automatically at a clean root URL with no
  extra Pages configuration. `config.testSummaryFile` stays local-only
  (not published).
- **New**: `.gitignore` (excludes `node_modules`).

## Data flow

1. Weekly cron fires (or a manual "Run workflow" click).
2. The Actions runner checks out the repo and runs `node run.js`.
3. `run.js` fetches the latest reading per market from data.gov.in,
   appends one JSON line per market to `data/mandi-prices.jsonl`, and
   regenerates `docs/index.html` from the full history.
4. The workflow commits both changed files as a bot commit and pushes.
5. GitHub Pages redeploys automatically (~1 minute).
6. The bookmarked Pages URL shows the new reading next time it's opened.

## Error handling

- Per-market fetch failures are already handled by the existing code
  (`collect-mandi.js` returns a `status: 'error' | 'no_data'` record instead
  of throwing; `generate-summary.js` renders a warning card for it). No
  change needed here.
- If something outside that handling throws (a real bug, not an expected
  network/data gap), the Actions step fails and GitHub emails the repo
  owner automatically — no custom alerting code needed.

## Testing

- Before relying on the schedule, run the workflow once manually via
  GitHub's "Run workflow" button and confirm the Pages site updates.
- Local sample-data testing continues to work unchanged via
  `node run.js --test`.
- No new automated test framework is introduced — the change is thin
  glue (a workflow file + one config rename) around already-working,
  already-tested-by-use code; adding a test harness for it would be
  scope beyond what this change needs.

## Implementation note

`package.json` lists `playwright` as a dependency, but no Stage-1 code
path uses it (`collect-mandi.js` uses the built-in `fetch`). The CI
workflow will run `npm install` but will not install Playwright's browser
binaries, to keep the workflow fast.

## Open items resolved during brainstorming

- Audience: single owner (Shashank), no auth.
- Reach: must be reachable from anywhere, not just this PC → rules out a
  local-only Task Scheduler approach.
- Hosting: GitHub Actions + GitHub Pages, chosen over a serverless+DB
  approach (Vercel/Netlify) and an always-on small server (Render/Fly.io)
  because it needs no new infrastructure, has no cold-start delay, and
  costs nothing.
- Repo visibility: public. The data (mandi mushroom prices) isn't
  sensitive, and a public repo is the simplest path to free Pages hosting.
