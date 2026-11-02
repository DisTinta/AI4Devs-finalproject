# Manual Interface Testing Report

- Date: 2026-11-02
- Change: e2e-playwright-suite
- Step: 11 Manual Interface Testing and 12 End-to-End Testing (agent's text)

The interface of this change is the command `npm run test:e2e` and its configuration. OS user name masked
in paths (`C:\Users\<user>\...`).

## Commands executed
- 11.1: `npm run test:e2e` from Bash; `pwsh -NoProfile -Command 'npm run test:e2e'`; `powershell.exe -NoProfile -Command 'npm run test:e2e'` (no `$env:` variable set)
- 11.2a: `npm -w packages/web run dev -- --host 127.0.0.1 --port 5173 --strictPort` (started in the background of one Bash call), then `npm run test:e2e`
- 11.2b: `npm -w packages/api run dev`, waited for `http://127.0.0.1:3000/health` to answer 200, then `npm run test:e2e`
- 11.3: `npx playwright test tests/e2e/zz-negative.spec.ts` on a temporary copy of `unknown.spec.ts` expecting «Motivo: llm-required»
- 11.4: `delete from query_log where created_at > '2026-11-02 17:55:00+00'`; `node scripts/dev-processes.mjs stop` after each run

## Versions
- Node v24.11.1 (CI uses 22); npm scripts through Git Bash; PowerShell 7.6.9 (`pwsh`) and Windows PowerShell 5.1.26100.9818 (`powershell.exe`); Playwright 1.64.1, Chromium build 1248.
- The local `.env` was not read (reads are denied to the agent); the suite does not need to know: its config sets `LLM_BASE_URL` and `LLM_API_KEY` empty, which win over `.env`, so the run is in evaluation mode either way.

## Results
- 11.1 "The suite passes locally": Bash, `pwsh` and `powershell.exe` each ran 5 tests (four spec files), 5 passed, exit code 0, 23.2 to 23.6 s. Also green in a first Bash run and in the broader checks of step 10.
- 11.2 "A taken port fails the run before any spec":
  - (a) web on `127.0.0.1:5173` answering 200: exit code 1 before any spec, with `Error: http://127.0.0.1:5173 is already used, make sure that nothing is running on the port/url or set reuseExistingServer:true in config.webServer.`
  - (b) API answering 200 on `http://127.0.0.1:3000/health`: exit code 1 before any spec, with the same error naming `http://127.0.0.1:3000/health`.
  - A first attempt with `npm -w packages/web run dev` and no `--host` bound the server to `localhost` only, which Playwright did not see on `127.0.0.1`, so it did not count as taken and the suite passed; the run was repeated with `--host 127.0.0.1`. This is why `docs/TESTING.md` tells to stop `npm run dev` first.
- 11.3 "A failing spec fails the suite and leaves its evidence": exit code 1, 1 failed; `test-results/zz-negative-Asking-Q6-on-acme-shop-shows-no-verified-answer-chromium/` holds `test-failed-1.png`, `trace.zip` and `error-context.md`; `playwright-report/index.html` exists; no browser window opened (headless, reporter `open: 'never'`). The copy was deleted and `git status` shows no trace of it. The CI job fails on the same condition because it runs `npm run test:e2e` with no `continue-on-error` (asserted by `e2e-job.spec.ts`).
- 11.4: `query_log` after 11.1 to 11.3 deleted (28 rows), count 0, equal to the baseline of the step 10 report; no dev process left.

## End-to-end workflows (step 12)
- The five tests of the four spec files cover: pick acme-shop, ask Q1, expand evidence, usage panel (`ask-flow`); Q6 to the honest unknown (`unknown`); Screen 2 to impact to high risk (`impact-flow`); the accessibility pass at 320 px and 1280 px over the three golden questions and the mocked long path (`ask-page.a11y`). Run of 10.2: 5 passed, 0 failed, 0 flaky, 23.6 s.
- `query_log`: 0 before, 34 after the step 10 runs, 0 after the cleanup; 28 more after step 11, 0 after the cleanup.

## UI evidence
- `./2026-11-02-11-negative-failure.png` — the failure screenshot of the negative run of 11.3.

## Outcome
- Status: PASS
- Blocking issues: none
