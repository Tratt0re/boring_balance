# Audit Remediation Plan

Source: full ECC audit (security, main-process review, renderer review, dead code, silent failures, build/tests/deps), 2026-10-28.
Status legend: `[ ]` todo, `[~]` in progress, `[x]` done, `[!]` blocked / needs decision.
Items tagged **(verified)** were reproduced or confirmed in code by the main session. Items tagged **(agent)** come from a subagent report only and must be re-verified before the fix starts.

## Working rules
- Phases run in order 0 to 7. Phases 5 to 7 may overlap later.
- One commit per task or small group, conventional prefixes (`fix:`, `feat:`, `doc:`, `chore:`).
- Ask before adding or removing any npm dependency, and before creating a new utility with no existing counterpart (CLAUDE.md).
- Nothing is committed or pushed without the owner's go-ahead.
- Git identity for this repo: `Salvatore De Luca <34335369+Tratt0re@users.noreply.github.com>`.

## Verification protocol (Chrome DevTools MCP)
Electron cannot be driven directly, so UI changes are checked in Chrome against the Angular dev server with the IPC layer mocked.
1. Start `npx ng serve` (http://localhost:4200).
2. Open it with `navigate_page` and pass an `initScript` that defines `window.electronAPI` before the app boots.
3. The mock mirrors the real preload shape: `electronAPI.ipcClient[channel][method](payload)` returning promises, plus `onIpcEvent` / `offIpcEvent`. Channels and methods come from `src/app/config/api.ts` and `electron/ipc/channels.js`.
4. Failure mode is switched on with `POST /__bridge/fail {"pattern":"update:"}` (any channel containing the pattern rejects with the given message).
5. Check with `take_snapshot`, `list_console_messages`, `list_network_requests`, `take_screenshot`, and `lighthouse_audit` where useful.
6. Main-process code (`electron/`) is verified with Node-side vitest tests (Phase 1), not Chrome.
7. Anything that only runs inside Electron (CSP effect, navigation guards, fuses, real file dialogs) is marked **manual Electron check** and listed for the owner.

Bridge: `npm run build && npm run dev:bridge` serves http://127.0.0.1:4300 (dev tooling only, never packaged; `build.files` excludes `scripts/`). It runs the real IPC handlers on a temporary SQLite seeded with 5 accounts, 4 categories, 6 months of transactions, transfers, valuations, budgets and a recurring plan, so the UI is checked against real behavior, not a fake. Control endpoints: `/__bridge/fail` (inject IPC failures by channel substring), `/reset`, `/dialog`, `/update`, `/emit`, and `GET /opened`, `/calls`. Native file dialogs return fixed paths (the import template; a temp folder).

---

## Phase 0: Hygiene
- [x] 0.1 Fix `src/app/app.spec.ts` (`NG0201 No provider for TranslateService`); `npm test -- --watch=false` must pass. **(confirmed; also needed an `UpdateService` stub and a `matchMedia` stub in the spec)**
- [x] 0.2 Untrack `tsconfig.spec.tsbuildinfo` (`git rm --cached`) and add `*.tsbuildinfo` to `.gitignore`. **(agent)**
- [x] 0.3 Add `.env*`, `*.db`, `*.sqlite*` safety-net entries to `.gitignore`.
- [x] 0.4 Fix Spanish i18n: add 45 missing keys, remove orphan `dataBackups.exportImport.import.placeholder`. **(verified: 45 missing, 1 extra)**
- [x] 0.5 Delete `docs/images/bb_ico_head.png` (0 references). **(agent)**
- [x] 0.6 Add `esbuild` to devDependencies (used by `scripts/build-preload.js`, undeclared). **Approved and done (pinned to 0.27.2).**
- [x] 0.7 Add `license` field to `package.json` (MIT).

## Phase 1: Safety net (tests before risky changes)
- [x] 1.1 Create `vitest.electron.config.*` (`environment: node`) and `npm run test:electron`. Decision: run vitest under Electron's Node (`ELECTRON_RUN_AS_NODE`) via `scripts/test-electron.js`, so the real better-sqlite3 binary is used. No new dependency.
- [x] 1.2 Tests: `electron/utils/money-parse.js`, `date-parse.js`.
- [x] 1.3 Tests: `electron/controllers/utils.js` validators (table-driven).
- [x] 1.4 Tests: `electron/models/query-utils.js`, `pagination.js`, plus `database/core_op.js` (SQL builder, injection safety, change counter) on in-memory SQLite.
- [x] 1.5 Tests: transfers atomicity on in-memory SQLite using the real `schemas/*.sql`.
- [x] 1.6 Tests: plan-items occurrence generation (month-end policies, DST, idempotent re-run).
- [x] 1.7 Renderer: model `fromDTO` / `toDTO` cent-conversion tests.
- [x] 1.8 Create the Chrome verification bridge (`scripts/dev-ipc-bridge.js` + `.server.js`, `npm run dev:bridge`) and verify it in Chrome. Done: it serves `dist/` and exposes the REAL controllers and SQL over loopback HTTP on a throwaway seeded database, instead of a hand-written mock. Verified: app boots with seeded data, console clean, cross-site Host/Origin requests get 403, path traversal 404.

## Phase 2: Security hardening
- [x] 2.1 H1 `shell.openExternal`: allow every `https://github.com/Tratt0re/boring_balance/...` URL and anything on `boringbalance.com` including every subdomain and path (never credentials or custom ports; owner widened this after the first version), via `electron/utils/external-url.js` (owner-confirmed; the local folder name `expense_tracker` is irrelevant) in `update.controller.js openRelease`; same check in `setWindowOpenHandler` and `will-navigate`, which today open ANY url. **(verified)**
- [x] 2.2 H2 Restore no longer trusts a renderer-supplied path. Owner requirement: restore must work from ANY location (e.g. the Desktop), so instead of confining it to the backup folder, a file is accepted only if the user picked it in a native dialog (`backup:selectRestoreFile`, single use) or it is a `boring-balance-backup-*.sqlite` file directly inside the configured backup folder (what the list in the UI offers). New UI button "Restore from file…" in all 7 languages. **(done, verified in Chrome)**
- [x] 2.3 H2 Import: `validate` and `commit` only read the file returned by `selectFile`; anything else returns a regular `FILE_NOT_SELECTED` import error and reads nothing. **(done, verified in Chrome)**
- [x] 2.4 H3 Content-Security-Policy added to `src/index.html`: `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'`. No `unsafe-eval`, no inline scripts. To make that possible the theme script moved from `index.html` to `public/theme-init.js`, and production builds set `inlineCritical: false` (Angular's critical-CSS inlining adds an `onload` handler the policy would block). Verified in Chrome on all 13 routes: no violations, charts and fonts load; injected inline scripts, `onclick`, `eval`, `new Function`, `javascript:` links, foreign scripts, fetches, images, frames, objects and form posts are all blocked. **Manual Electron check still needed** (see below). `style-src 'unsafe-inline'` stays because Angular and the UI library set inline styles at runtime; it cannot run scripts.
- [ ] 2.5 `session.setPermissionRequestHandler` deny-all. Manual Electron check.
- [ ] 2.6 IPC sender validation in `electron/ipc/index.js`. **(agent)**
- [ ] 2.7 Allow-list writable `app-meta` keys (hide `db_uuid`, `change_counter`, `schema_version`). **(agent)**
- [ ] 2.8 Validate `ignoreVersion` payload type. **(agent)**
- [ ] 2.9 Import: file size cap and row cap in `excel-utils.js`. **(agent)**
- [ ] 2.10 Update fetch: `AbortSignal.timeout`; validate returned `releaseUrl`.
- [ ] 2.11 Ignore `ELECTRON_RENDERER_URL` when `app.isPackaged`.
- [ ] 2.12 Tie backup/sync `folderPath` to the folder dialog result.
- [ ] 2.13 (owner approved; do last in Phase 2) Electron fuses (`RunAsNode`, `EnableNodeCliInspectArguments`, `OnlyLoadAppFromAsar`). **Dependency question** (`@electron/fuses`).

## Phase 3: Data safety
- [ ] 3.1 H4 Restore: open candidate read-only, run `integrity_check`, require `app_meta`, before closing the live DB. **(verified gap)**
- [ ] 3.2 H4 `safeReplaceFileWithBackup`: move WAL/SHM unlinks inside the rollback `try`. **(verified)**
- [ ] 3.3 Failed restore or pull must put `previousLocalCopyPath` back, or surface a clear "restart required" error. **(agent)**
- [ ] 3.4 H5 Plan `run` and `create_and_run` inside one `database.transaction`; cap `count` (e.g. 1000). **(verified and reproduced: a failing 4th occurrence leaves 3 rows, `create_and_run` leaves the plan row, count 10,000,000 is accepted; 3 `it.fails` tests in `tests/electron/plan-items.test.js`)**
- [ ] 3.5 H6 DST: build day/week occurrences with local `Date` arithmetic. **(verified: reproduced)** Decide how to treat already-stored timestamps (tolerant match or migration) before shipping. 5 `it.fails` tests cover autumn and spring DST in Europe/Rome and America/New_York; note the bug also hits the US, not only Europe.
- [ ] 3.6 Reset: bump change counter; make the failure path recover the DB; show `result.error` in the UI. **(agent)**
- [ ] 3.7 One shared lock for backup, restore, sync, reset. **(agent)**
- [ ] 3.8 Reject direct edit/delete of transfer legs through the generic transactions API, and reject a transfer-category row with no `transfer_id`. **(verified: reproduced; 4 known-issue tests in `tests/electron/transfers.test.js` must be flipped to assert the call throws)**
- [ ] 3.9 Amount parsing: reject more than 2 decimals and non-safe integers; align with `parseDecimalToCents`. Also make the renderer `amountToCents` (`Math.round`) and the main-process `normalizeAmountToCents` round negative half cents the same way: today they disagree on -0.005, -0.015, -2.675, -1234567.895 (one cent off), and the renderer can return -0. **(verified; pinned by a test in `src/app/models/models.spec.ts` and `it.fails` in `tests/electron/controllers-utils.test.js`)**
- [ ] 3.10 Migrations: version tracking (`user_version` or `schema_migrations`), per-file transaction, backup before applying. **(verified: none today)**
- [ ] 3.11 Friendly error when deleting an account or category that still has rows.
- [ ] 3.13 Tighten the IPC validators in `controllers/utils.js`: reject booleans, arrays, hex/exponent strings in `normalizePositiveInteger`; reject `null`/`""`/`false` in `normalizeInteger` and `normalizeNonNegativeInteger`; make `ensurePlainObject` reject `Date`/`Map`. Flip the matching `it.fails` tests in `tests/electron/controllers-utils.test.js` to plain `it`. **(verified by probe, 15 `it.fails` tests)**
- [ ] 3.12 Add index on `transactions(occurred_at)`; push the transfers `accounts` filter into SQL. (performance)

## Phase 4: Error visibility
- [ ] 4.1 H7 Corrupt `settings.json`: rename to `.corrupt-<ts>`, log, surface state error; stop writing defaults over it. **(agent: re-verify)**
- [ ] 4.2 Backup prune failure must not mark a good backup as failed. **(verified)**
- [ ] 4.3 Quit-time backup/sync failure: ask the user before quitting. **(agent)**
- [ ] 4.4 Sync push must not advance `lastPublishedCounter` when the index was not updated. **(agent)**
- [ ] 4.5 Wrap error-handler and cleanup `unlinkSync` calls so they cannot mask the original error. **(agent)**
- [ ] 4.6 Warn when auto-backup or sync is silently disabled (missing folder).
- [ ] 4.7 Corrupt tags JSON: log a warning with the row id.
- [ ] 4.8 Renderer: `update.service.ts` through `BaseIpcService` (`APIChannel.UPDATE`), `.catch` in `app.ts`, toast in about section. Verify in Chrome with mock failure mode. **(agent)**
- [ ] 4.9 Renderer: move direct `window.electronAPI` uses (`root-layout.ts`, `reload-app-shell.ts`) behind services.
- [ ] 4.10 Renderer: hardcoded English toasts to i18n keys (`sync.service.ts`, `backup.service.ts`, about section).
- [ ] 4.11 Renderer: guards or validators for the non-null `!` form IDs before submit.

## Phase 5: Dependencies
- [ ] 5.1 Electron 40.4.0 to latest 40.x (check version first). Manual Electron check.
- [ ] 5.2 Angular patch update within 21.x; re-run tests and build.
- [ ] 5.3 `better-sqlite3`, `electron-builder`, `@electron/rebuild`, `postcss`, `tailwindcss` minor/patch updates.
- [ ] 5.4 Re-run `npm audit` and record what remains and why (dev-only tooling noise is accepted).
- [ ] 5.5 Align `build-preload.js` `target` with the Node version in the Electron release.
- [ ] 5.6 Evaluate majors separately (`ngx-echarts`, `@ngx-translate`, `lucide-angular`, `typescript`). Not in scope unless approved.

## Phase 6: Dead code and refactor
- [ ] 6.1 Remove unused shared components: accordion, alert, carousel, form, kbd, progress-bar, slider. **(verified: 0 external references)**
- [ ] 6.2 Remove embla packages after 6.1. **Dependency removal needs owner approval.**
- [ ] 6.3 Remove `AppMetaService` and the `appMeta` channels end to end (channels.js, handlers, controller, model, api.ts, DTOs). Keep the main-process `app-meta` model if the DB layer uses it.
- [ ] 6.4 Remove unused `public/` icons (keep `favicon.ico` unless owner says otherwise) and unused font variants (`.eot`, `.ttf`, `.woff`) after confirming against `fonts.css`.
- [ ] 6.5 Drop unused electron exports (`extractOptionsPayload`, `normalizeOptionalAmountFilterToCents`, `readCellValue`, others).
- [ ] 6.6 Merge duplicates: `allocateBucketsToTargetTotalCents`, `toAmount`, `pad2`, `isPlainObject`.
- [ ] 6.7 Clean unused i18n keys (about 100) across all 7 locales, only after checking dynamic key construction.
- [ ] 6.8 Trim unused type exports (low value).
- [ ] 6.9 `OnPush` on the remaining components; standardise on `takeUntilDestroyed`.
- [ ] 6.10 Split the largest files (data-table 1574, transactions-table-section 1538, transfers-table-section 1296, budget-page 852, upsert-plan-item-dialog 772, sync.service 687). One file per commit, verified in Chrome.
- [ ] 6.11 Tidy dialog/sheet `any` and unsafe casts.

## Phase 7: Project tooling
- [ ] 7.1 `.github/workflows/ci.yml`: `npm ci`, tests, `ng build`, `build:preload`.
- [ ] 7.2 `.github/dependabot.yml` (weekly npm, Angular grouped).
- [ ] 7.3 `format` / `format:check` scripts (Prettier is configured but not a declared dependency). **Dependency question.**
- [ ] 7.4 Optional ESLint (`angular-eslint`). **Dependency question.**
- [ ] 7.5 README: add dev/build instructions or link to CLAUDE.md; consider CONTRIBUTING.
- [ ] 7.6 Code signing and notarization (macOS/Windows) if the app is distributed. Owner decision.
- [ ] 7.7 Document the manual update check (no auto-updater) in the README.

---

## Open decisions for the owner
1. Add `esbuild` to devDependencies (0.6).
2. Dependencies needed for tests and fuses (1.1, 2.13), formatting and lint (7.3, 7.4).
3. How to handle stored recurring-event timestamps after the DST fix (3.5).
4. Keep `favicon.ico` and `components.json`?
5. Code signing: needed, and with which certificates (7.6)?

## Progress log
| Date | Phase | Notes |
|---|---|---|
| 2026-10-28 | - | Audit complete, plan created. No code changed yet. |
| 2026-10-28 | 0 | 0.1-0.5 and 0.7 done. `npm test` 2/2 pass, `ng build` clean. 0.6 (`esbuild`) waits for owner approval. |
| 2026-10-28 | 0 | Phase 0 complete and committed locally (5 commits, not pushed). `esbuild` approved. Dead day check removed from `date-parse.js`. |
| 2026-10-28 | 1 | 1.1 and 1.2 done: `npm run test:electron`, 59 tests. Local note: better-sqlite3 binary was a Linux ELF; fixed with `electron-rebuild` (node_modules only). |
| 2026-10-28 | 1 | 1.3 done: 138 validator tests (197 total), 7 of 7 mutants killed. `it.fails` tests document known validator weaknesses; new task 3.13 fixes them. |
| 2026-10-28 | 1 | 1.4 done: `core_op.js` SQL builder, query-utils and pagination tests (260 total); 11 of 11 mutants killed, including injection guards. Confirmed `controllers/utils.resolvePaginationWindow` and `models/pagination.resolvePaginationWindow` are identical (locked by a test until 6.6 merges them). |
| 2026-10-28 | 1 | 1.5 done: 54 transfer tests on the real schema via `tests/electron/helpers/electron-db.js` (314 total); 10 of 10 mutants killed, incl. removing each transaction wrapper. Atomicity of create/update/remove confirmed by trigger-injected failures. 3.8 upgraded from agent claim to verified (a leg can be edited, detached or deleted through the generic API). |
| 2026-10-28 | 1 | 1.6 done: 118 plan-item tests (436 total), run in 4 time zones; 17 of 17 mutants killed (one survivor exposed a weak `last_day` test, fixed). Reproduced H5 and H6 with tests: failed runs are not atomic, `create_and_run` leaves the plan, count is unbounded, and weekly/daily plans drift by an hour after any DST change (confirmed in Rome and New York). Full suite also passes with the host TZ set to New York, Tokyo and UTC. |
| 2026-10-28 | 1 | 1.7 done: 38 renderer model tests in `src/app/models/models.spec.ts` (40 total); 12 of 12 mutants killed. New finding: the renderer and main process round negative half cents differently, so a negative amount entered in the UI can be stored one cent off (3.9 updated). Positive amounts and all values reachable from stored cents round-trip exactly. |
| 2026-10-28 | 1 | 1.8 done: Chrome bridge built and verified. Confirmed in a real browser: (a) the 45 Spanish import/export strings render with no raw keys or English fallbacks, and the validate flow shows localized errors; (b) PLAN 4.8 reproduced: with the update channel failing, startup logs an unhandled `ERROR Error invoking remote method update:check` and clicking "Buscar actualizaciones" logs another one, shows no toast, and leaves the button usable with no feedback. Phase 1 complete. |
| 2026-10-28 | 1 | Phase 1 committed (9 commits, not pushed). Owner decisions for Phase 2: release links are limited to `https://github.com/Tratt0re/boring_balance/releases`; CSP approved (tested in the bridge, then a manual Electron check list); Electron fuses pending explanation. |
| 2026-10-28 | 2 | 2.1 done: `electron/utils/external-url.js` allow-list with 79 tests, 11/11 mutants killed (one survivor exposed a missing no-throw test). Wired into `openRelease`, `setWindowOpenHandler` and `will-navigate`; no raw `shell.openExternal` is left. Verified with the real `openRelease` and a stubbed shell: only the repo and boringbalance.com URLs open. Handles `..`, `%2e%2e`, backslashes, `user@host`, lookalike and subdomain hosts, `file:`/`smb:`/`javascript:` and non-string input. Manual Electron check: click "Open on GitHub" and a release link. |
| 2026-10-28 | 2 | 2.1 widened by owner request: `boringbalance.com` now allows all subdomains and paths (90 tests; 4 more mutants killed, incl. the missing-dot suffix bug that would admit `evilboringbalance.com`). Owner also approved Electron fuses (2.13) and confirmed restore must accept a file from ANY location (e.g. the Desktop). |
| 2026-10-28 | 2 | 2.2 and 2.3 done: `electron/utils/authorized-path.js`, `backup:selectRestoreFile`, guards in the backup and import controllers; 41 tests (567 total), 14/14 mutants killed after one survivor exposed that respelled paths (`./`, `..`) were untested. Chrome check against the real controllers: restoring from a Desktop copy outside the backup folder works and replaces the data; `/etc/hosts`, a planted `/tmp` file, a reused file and arbitrary xlsx paths are all refused, and importing the picked template still validates. Known follow-up: restore still does not check that the file is a valid SQLite database (PLAN 3.1). |
| 2026-10-28 | 2 | 2.4 done: CSP + `public/theme-init.js`; 23 tests (590 total), 20/20 mutants killed. A first Chrome run looked like `eval` was still allowed, but that was the DevTools runner itself; re-tested with a normal same-origin script and the policy blocks `eval`, `new Function` and string timers. Manual Electron checks owed: (1) app opens with a styled UI and charts in a packaged build, (2) dark theme applies at startup with no flash, (3) DevTools console shows no CSP violation lines. |
