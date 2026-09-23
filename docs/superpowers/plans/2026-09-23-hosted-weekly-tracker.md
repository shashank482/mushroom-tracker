# Hosted Weekly Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the manual mandi-price tracker into a self-updating, publicly reachable site: a weekly GitHub Actions workflow runs the existing collector, and GitHub Pages serves the result.

**Architecture:** Existing Node scripts are untouched except for one output-path change (`summary.html` → `docs/index.html`) and a directory-creation fix. A new GitHub Actions workflow runs `node run.js` weekly and commits the result back to the repo. GitHub Pages serves `/docs` on the `master` branch.

**Tech Stack:** Node.js (built-in `fetch`, `fs`), GitHub Actions, GitHub Pages, GitHub CLI (`gh`) for one-time repo/Pages setup.

**Spec:** `docs/superpowers/specs/2026-09-23-hosted-weekly-tracker-design.md`

## Global Constraints

- No new database — the JSONL flat file (`data/mandi-prices.jsonl`) remains the only data store.
- No authentication — single owner, no login, no per-user access control.
- No new automated test framework — verification uses direct script runs and manual checks, matching this repo's existing `--test` convention.
- Repository must be `shashank482/mushroom-tracker`, **public**.
- CI installs must not download Playwright browser binaries (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`) — Stage 1 code doesn't use Playwright.
- GitHub Pages serves from the `master` branch, `/docs` folder.

## Already done (prior to this plan)

- `.gitignore` (excludes `node_modules/`) created and committed.
- Local git repo initialized; two commits exist: the design spec, and the original Stage-1 scripts.
- These are not repeated as tasks below.

---

### Task 1: Point real output at `docs/index.html` and fix directory creation

**Files:**
- Modify: `generate-summary.js` (the `generate()` function, currently around line 146-148)
- Modify: `config.js` (the `summaryFile` value, currently line 45)
- Delete: `summary.html` (stale root output, superseded by `docs/index.html`)

**Interfaces:**
- Consumes: `generate({ dataFile, outputFile, isTestMode })` — existing exported signature from `generate-summary.js`, unchanged.
- Produces: `docs/index.html` on disk whenever `outputFile` is `'docs/index.html'`; `config.summaryFile` now resolves to `'docs/index.html'` for any caller (currently only `run.js`).

- [ ] **Step 1: Demonstrate the missing-directory bug**

Run this from the project root (`D:\OneDrive\Mushroom Market Tracker\mushroom-tracker`):

```bash
node -e "const { generate } = require('./generate-summary'); generate({ dataFile: 'data/sample-mandi-prices.jsonl', outputFile: 'docs/index.html', isTestMode: true });"
```

Expected: it throws `ENOENT: no such file or directory, open '...\docs\index.html'` — because `generate-summary.js` never creates the `docs/` folder before writing into it.

- [ ] **Step 2: Confirm the failure**

Re-run the same command and confirm the same `ENOENT` error appears. This confirms the bug is real, not a fluke.

- [ ] **Step 3: Fix `generate-summary.js` to create its output directory**

In `generate-summary.js`, find:

```javascript
  const fullOutputPath = path.join(__dirname, outputFile);
  fs.writeFileSync(fullOutputPath, html, 'utf8');
```

Replace with:

```javascript
  const fullOutputPath = path.join(__dirname, outputFile);
  fs.mkdirSync(path.dirname(fullOutputPath), { recursive: true });
  fs.writeFileSync(fullOutputPath, html, 'utf8');
```

- [ ] **Step 4: Verify the fix**

Run the same command from Step 1 again:

```bash
node -e "const { generate } = require('./generate-summary'); generate({ dataFile: 'data/sample-mandi-prices.jsonl', outputFile: 'docs/index.html', isTestMode: true });"
```

Expected: no error, and `Summary page written to docs/index.html. Open it by double-clicking the file.` is printed. Then remove this throwaway sample-data output so it isn't mistaken for real data later:

```bash
rm -rf docs
```

- [ ] **Step 5: Point real output at the new path**

In `config.js`, find:

```javascript
  summaryFile: 'summary.html',
```

Replace with:

```javascript
  summaryFile: 'docs/index.html',
```

(`testSummaryFile: 'summary-test.html'` stays unchanged — it's local-only, never published.)

- [ ] **Step 6: Remove the now-stale root summary file**

```bash
git rm summary.html
```

- [ ] **Step 7: Generate the real output end-to-end**

```bash
node run.js
```

This fetches this week's real mandi prices, appends to `data/mandi-prices.jsonl`, and writes `docs/index.html`. Verify:

```bash
grep -c "Mushroom Market Tracker" docs/index.html
```

Expected: `1` or more (the title/heading appear in the generated page).

- [ ] **Step 8: Commit**

```bash
git add config.js generate-summary.js docs/index.html data/mandi-prices.jsonl
git commit -m "feat: publish summary to docs/index.html for GitHub Pages"
```

---

### Task 2: Add the weekly GitHub Actions workflow

**Files:**
- Create: `.github/workflows/weekly-collect.yml`

**Interfaces:**
- Consumes: `node run.js` (existing CLI entry point from Task 1's repo state — no code changes needed here, this task only adds automation around it).
- Produces: a scheduled + manually-triggerable Actions workflow named `weekly-collect.yml`, job id `collect`.

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/weekly-collect.yml`:

```yaml
name: Weekly mandi price collection

on:
  schedule:
    - cron: '30 4 * * 1'
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci
        env:
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'

      - name: Collect prices and regenerate summary
        run: node run.js

      - name: Commit and push updated data and summary
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          if git diff --quiet -- data/mandi-prices.jsonl docs/index.html; then
            echo "No changes to commit."
          else
            git add data/mandi-prices.jsonl docs/index.html
            git commit -m "chore: weekly mandi price update"
            git push
          fi
```

(`30 4 * * 1` = 04:30 UTC every Monday = 10:00 AM IST every Monday.)

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/weekly-collect.yml
git commit -m "ci: add weekly mandi price collection workflow"
```

No standalone test for this step: a GitHub Actions workflow file can only be meaningfully validated by GitHub actually running it, which happens in Task 6 after the repo exists (Task 4) and Pages is live (Task 5). This mirrors the spec's own Testing section, which defers functional verification to a manual "Run workflow" trigger.

---

### Task 3: Create the GitHub repository and push

**Files:** none (operates on the existing local repo's remote configuration).

**⚠️ Checkpoint:** Step 3 below publishes this code publicly on GitHub under `shashank482/mushroom-tracker`. Confirm with the user immediately before running it — this is exactly the kind of action that needs a fresh go-ahead at execution time, not just the plan's earlier approval.

- [ ] **Step 1: Ensure GitHub CLI is installed**

```bash
gh --version
```

If not found, install it:

```powershell
winget install --id GitHub.cli -e --source winget
```

Then re-check `gh --version` in a fresh shell (PATH may need a new session to pick up the install).

- [ ] **Step 2: Authenticate**

```bash
gh auth login --web --git-protocol https --hostname github.com
```

This prints a one-time code and a URL. **Hand control to the user here**: they open the URL in their own browser, enter the code, and approve access as `shashank482`. Do not attempt to complete this step on their behalf.

Verify:

```bash
gh auth status
```

Expected: shows logged in to github.com as `shashank482`.

- [ ] **Step 3: Create the repo and push (checkpoint — confirm with user first)**

```bash
gh repo create shashank482/mushroom-tracker --public --source=. --remote=origin --push
```

- [ ] **Step 4: Verify**

```bash
git remote -v
git log origin/master -1
```

Expected: `origin` points to `https://github.com/shashank482/mushroom-tracker.git` (or the `git@` equivalent), and `origin/master` matches local `HEAD`.

---

### Task 4: Enable GitHub Pages from `/docs` and verify the live site

**Files:** none (GitHub repository settings, via `gh api`).

**⚠️ Checkpoint:** this makes the tracker's summary page publicly viewable at a real URL. Confirm with the user before Step 1.

- [ ] **Step 1: Check whether Pages is already configured**

```bash
gh api repos/shashank482/mushroom-tracker/pages
```

If this returns `404`, Pages isn't configured yet — proceed to Step 2. If it returns a JSON object, skip to Step 3.

- [ ] **Step 2: Enable Pages from `master` / `/docs`**

```bash
gh api -X POST repos/shashank482/mushroom-tracker/pages -f "source[branch]=master" -f "source[path]=/docs"
```

- [ ] **Step 3: Wait for the first build, then verify**

Pages builds typically finish within a minute. Then:

```bash
curl -sL https://shashank482.github.io/mushroom-tracker/
```

Expected: the response contains `<title>Mushroom Market Tracker</title>` (or the visible `Mushroom Market Tracker` heading). If the request 404s, wait 30 seconds and retry — the first deployment can take a short while to propagate.

---

### Task 5: Trigger the workflow manually and confirm the full loop works

**Files:** none.

- [ ] **Step 1: Trigger the workflow**

```bash
gh workflow run weekly-collect.yml --repo shashank482/mushroom-tracker
```

- [ ] **Step 2: Watch it run**

```bash
gh run watch --repo shashank482/mushroom-tracker
```

Wait for it to complete.

- [ ] **Step 3: Verify the run succeeded**

```bash
gh run view --repo shashank482/mushroom-tracker --log
```

Expected: the `Collect prices and regenerate summary` and `Commit and push updated data and summary` steps both show success (the commit step may legitimately print `No changes to commit.` if this week's price was already collected in Task 1 — that still counts as success).

- [ ] **Step 4: Re-verify the live site**

```bash
curl -sL https://shashank482.github.io/mushroom-tracker/
```

Expected: still returns the page successfully. This closes the loop described in the spec's Testing section — the schedule can now be trusted to run unattended going forward.
