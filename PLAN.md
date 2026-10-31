# Plan: design critique and UX copy fixes

Source: Impeccable critique of the whole app, 2026-10-30. Archived run: `.impeccable/critique/2026-10-30T20-40-40Z__src-app.md`.
Score: **21/40** (Acceptable). Weakest heuristic: Error Recovery (1/4).
Method: source-only review (design + copy), plus a static detector scan (0 findings). The app was not launched, so nothing was checked for computed contrast or rendered behavior.

Delete this file when the plan is finished, as was done with the previous `PLAN.md`.

## Decisions (confirmed by the user)

1. **Locales:** all 7 languages (en, de, es, fr, it, uk, zh) in every phase.
2. **Plurals:** `_one` / `_other` key pairs. No new dependency.
3. **Restore:** do **not** touch restore functionality. No automatic safety backup. Restore copy must only warn truthfully and must never claim a safety copy exists.
4. **Phase 7** (visual identity, Overview focus) is the last step and optional. Discuss it when we get there.
5. **Scope:** Phases 0 to 6.

## Rules for every phase

- Follow CLAUDE.md: reuse existing utilities, ask before adding npm dependencies, ask before creating a new utility with no similar counterpart.
- Edit all 7 locale files together. `public/i18n/*.json` currently have exactly 1,053 keys each.
- Copy claims must be verified against the code (for example, what a reset deletes) before being written.
- Keep key names stable where possible. Rename a key only when the key itself carries the old term.
- Translations for de, es, fr, it, uk, zh are drafts. Flag them for the user's review.
- Run `npm test`, `npm run lint` and `npm run format:check` after each phase. One commit per phase, lowercase conventional prefix (`fix:`, `feat:`, `doc:`).

## Codebase facts the plan relies on

| Area | Fact |
|---|---|
| Toasts | 144 `toast.success` / `toast.error` calls, all via `translateService.instant(...)` |
| Dialogs | Shared `src/app/shared/components/alert-dialog/*`, plus `pages/settings/components/sections/data-section/reset-confirm-dialog.component.ts`. Used by backups, sync, data, export, budget and recurring pages. |
| Raw errors | `reset-confirm-dialog.component.ts:55` renders `errorDetail()` verbatim |
| i18n setup | `src/app/shared/core/provider/providei18n.ts`: ngx-translate with HTTP loader, no ICU or message-format package |
| Reset scope | `electron/controllers/reset.controller.js:34` deletes by a table list. The scope in the copy must match it. |
| Onboarding | `src/app/features/onboarding/*` (start step, confirm step), guarded by `core/guards/onboarding.guard.ts` |
| Specs | 10 specs exist, none cover copy. `data-section.component.spec.ts` and `sync.service.spec.ts` load translations and will break on key renames. |
| Recurring summary | Built in `recurring-events-page.ts:399` via `recurringEvents.table.schedule.summary` |

## Findings

### Heuristic scores

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Bare status words (Idle/Running/OK). "Reloading app data..." gives no reason. |
| 2 | Match system / real world | 2 | Settled, Ledger Balance, After R&P, Pull/Push, Change counter, sync space |
| 3 | User control and freedom | 2 | No undo on delete/clear. Restore does not say what is lost. |
| 4 | Consistency and standards | 2 | Terminology and casing drift. "Yes, clear data" next to "Reset app". it/es translate "Transactions" two ways. |
| 5 | Error prevention | 2 | Clear data is a plain Yes dialog. Delete and import confirms show no counts. |
| 6 | Recognition over recall | 3 | Nav says "Recurring events", the child page says "Planned items" |
| 7 | Flexibility and efficiency | 2 | No visible shortcuts. Filters live in a dialog. Duplicate needs a confirm. |
| 8 | Aesthetic and minimalist design | 2 | Descriptions restate titles. Overview packs 5+ cards. |
| 9 | Error recovery | 1 | About 50 strings are "Failed to X." Raw Electron errors leak through `{{error}}`. |
| 10 | Help and documentation | 2 | Sync and recurring helpers are excellent. Nothing explains ledger vs snapshot, Exclude, settled. |

### Design specificity

Partly authored, mostly category-default.
- **Specific to the product:** local-first, no-ads, "boring" copy voice. Ledger vs valuation model. Money-flow Sankey. Plan-vs-actual budgets. A colorblind-conscious palette (income blue hue 260, expense coral hue 25).
- **Generic:** shadcn shell, pure-grey neutrals, Manrope only, no brand accent, 8 chart hues plus 15 system colors.
- **Detector:** 0 findings in `src/app` and `src/index.html`.
- **Stylesheet:** no global `:focus-visible` rule. Dark mode is class-driven, with no `prefers-color-scheme`. Reduced motion is handled.

### Priority issues

| # | Sev | Issue | Phase |
|---|---|---|---|
| 1 | P1 | Failure messages carry no cause or recovery (about 50 "Failed to X.", raw errors leak) | 1 |
| 2 | P1 | Destructive and replace-all flows do not name the object and consequence | 2 |
| 3 | P2 | Terminology drift and jargon | 3 |
| 4 | P2 | Redundant headings and helper text | 4 |
| 5 | P2 | Hard-coded English and weak accessible names | 5 |
| 6 | P3 | No guided path after onboarding | 6 |

### Copy audit

Format: key or location, current text, proposed text. Verify each against the code before applying.

**Errors and recovery (Phase 1)**

| # | Key / location | Current | Proposed |
|---|---|---|---|
| 1 | `settings.data.reset_error` | "Something went wrong. Please try again." | One key per action, e.g. "Couldn't clear your data. Nothing was deleted. Restart the app and try again." Only if verified true. |
| 2 | `*.toasts.*Error`, `*.dialog.*.errors.createFailed` (about 30) | "Failed to create account." | "Couldn't create the account. Try again." Inline: "…Check the highlighted fields and try again." |
| 3 | `*.errors.fixValidation` (x10) | "Please fix the highlighted fields before creating the account." | One shared `common.errors.fixHighlightedFields`: "Fix the highlighted fields to continue." |
| 4 | `recurringEvents.dialog.add.errors.countRequired`, `…intervalPositive` | "Occurrences count is required." / "Frequency interval must be a positive integer." | "Enter how many times it should repeat." / "Enter a whole number greater than 0." |
| 5 | `*.toasts.*Success` (about 20) | "Account created successfully." | "Account created." Consider dropping routine ones where a visible state change already confirms. |
| 6 | `reset-confirm-dialog.component.ts:55` | Renders raw `errorDetail()` | Map known Electron errors to i18n keys at the service boundary |

**Destructive and replace-all dialogs (Phase 2)**

| # | Key / location | Current | Proposed |
|---|---|---|---|
| 7 | `settings.data.clear_financial.confirm.cta` | "Yes, clear data" | "Delete all financial data" |
| 8 | `settings.data.clear_financial.description` vs `.confirm.body` | Description lists accounts, transactions, transfers, budgets. Body adds "categories you have created". | One identical list, checked against the table list in `reset.controller.js` |
| 9 | `settings.data.factory_reset.confirm.title` / `.label` | "Factory reset?" / "Factory reset". Two CTAs read "Reset app". | "Delete everything and reset Boring Balance?" Button: "Delete everything and reset". |
| 10 | `dataBackups.backups.restoreAlert.description` | "Restore "{{fileName}}" and replace your current data with that saved copy. Continue?" | "Replace your current data with {{fileName}}? Anything added since that backup will be lost." Button: "Replace with this backup". **No claim about a safety copy** (decision 3). |
| 11 | `restoreAlert.title`, `deleteAlert.title`, `accountValuations.deleteAlert.title` | "Restore backup" / "Delete backup" / "Delete snapshot" | "Restore this backup?" / "Delete this backup?" / "Delete this snapshot?" |
| 12 | Delete-transaction dialog | Does not identify the transaction | Show date, amount and description |
| 13 | `accountValuations.deleteAlert.description` | "Are you sure you want to delete this valuation snapshot? This action cannot be undone." | "Delete the 12 Oct snapshot (€4,210)? This can't be undone." |
| 14 | `recurringEvents.deleteAlert.options.deleteLinkedItems` | "Also delete linked items already created by this plan" | "Also delete the {{count}} transactions already created from it" (unchecked by default) |
| 15 | Excel import confirm | "This will import data into your database." | State the number of rows, and which accounts/categories are affected |
| 16 | `accounts.archiveAlert.description` | "Archive "{{name}}" so it no longer appears in new entries. Existing history will keep the account name." | "Hidden from new transactions and transfers. Past transactions keep it. You can unarchive it any time." Button: "Archive account". |
| 17 | `common.yes` / `common.no` | "Yes" / "No" | Remove from the shared set. Guard with a spec. |

**Terminology and jargon (Phase 3)**

| # | Key / location | Current | Proposed |
|---|---|---|---|
| 18 | `dataBackups.sync.overview.*`, `setup.*`, `repoPath` | "sync space", "App sync folder", "snapshot", "repo" | "Sync folder" throughout. "Create new sync folder" / "Join existing sync folder". |
| 19 | `sync.actions.pullNow` / `pushNow` | "Pull now" / "Push now" | "Get updates" / "Send my changes" |
| 20 | `sync.files.columns.changeCounter` | "Change counter" | "Revision", or drop from the UI |
| 21 | `sync.alerts.conflictHint` | "…choose the correct default." | "Both versions were kept. Compare the dates in Available sync files and use the one you want to continue with." |
| 22 | `sync.status.values.*` vs `backups.status.*` | "OK / Error" vs "Completed / Failed" | "Completed / Failed" in both |
| 23 | `autoBackup.intervalMin`, "Retention count" | "Interval (minutes, 0 to disable)" | "Back up automatically" using the existing select. "Backups to keep". |
| 24 | `overview.cards.netWorth.totalAfterRP` | "After R&P" | "After receivables and payables" |
| 25 | `…tooltips.ledgerBalance` / `marketValue`, `settings.general.cards.dashboardValuationMode` | "Ledger Balance", "Market Value", "Include valuations / Ledger balances only" | "Balance from transactions" / "Latest recorded value". Setting label: "Net worth uses". |
| 26 | `overview.banners.snapshotsOutdated.body` | "Your latest snapshot is {{days}} days old. Update snapshots to keep Net Worth accurate." | "Your investment values were last updated {{days}} days ago." plus an "Update values" button. Plural-aware. |
| 27 | `overview.cards.recentTransactions.tooltips.*` | "Settled / Settle / Unsettled" | "Paid / Mark as paid / Pending", or define "settled" once |
| 28 | `moneyFlowSankey.nodes.unused` / `priorBalances` | "Unused", "Prior balances" | "Left over", "Carried over from earlier months" |
| 29 | `series.incomes`, `nodes.incomes`, `series.netCashflow`, "Net Worth", "Other Expense", "Hand Coins", "Piggy Bank", "Shopping Cart", "Account Valuations" | "Incomes", title case | "Income", "Net cash flow", "Net worth". Sentence case everywhere. |
| 30 | `category.exclude.*`, `category.type.exclude` | "Exclude" | "Not counted". Description: "Doesn't count toward income, spending or budgets." |
| 31 | Nav `nav.items.recurringEvents` vs `recurringEventItems.page.title` | "Recurring events" / "Planned items" | "Recurring payments" / "Scheduled items" |
| 32 | `nav.sections.main` / `.setup` | "Menu" / "Setup" | Drop "Menu". Group "Plan" (Budget, Recurring) and "Manage" (Accounts, Categories). |
| 33 | `recurringEvents.runResult.labels.*` | "Recurring plan / Created now / Already existed / Scheduled dates" | "Recurring event / New items / Already added / Dates covered" |
| 34 | `recurringEvents.monthPolicy.*` | "Default / Use the last valid day / Skip / Last day / First day" | Labels with examples, e.g. "Use the month's last day (30 Apr for the 31st)" / "Skip that month" / "Move to the 1st of next month" |
| 35 | `recurringEvents.updateResult.actions.ok`, `runResult.actions.ok` | "OK" | "Done" or "View items" |
| 36 | `onboarding.confirm.import_note` and the start card | Points to "Settings → Export & Import". Conflates backups and Excel exports. | "Settings, Data & Backups, Import / Export" (the name that exists). Card: "Import existing data". |
| 37 | `settings.general.cards.currency.fieldLabel` | "Symbol" (placeholder "CHF") | "Currency symbol". Verify the onboarding claim "override per account" before keeping it. |
| 38 | Nav Transactions icon | `badge-euro` regardless of the user's currency | A currency-neutral icon (receipt or arrows) |
| 39 | it.json (nav and `common` use "Movimenti"; lines about 511, 1398, 1543 use "Transazioni"). Same split in es.json (Movimientos / Transacciones). | Two terms for one concept | One term per language. **Needs a native-speaker check.** |

**Plurals and fragments (Phase 3)**

| # | Key / location | Current | Proposed |
|---|---|---|---|
| 40 | `recurringEvents.table.schedule.summary` (built at `recurring-events-page.ts:399`) | "Occurs {{count}} times, {{interval}} every {{unit}}" with "day(s)/week(s)" | `_one`/`_other` keys, e.g. "Repeats every month, 12 times" / "Repeats every {{count}} weeks, 12 times" |
| 41 | `common.pagination.counter`, `tooltips.toLastPage` | "{{current}} of {{total}} pages"; "To last page, page" | "Page {{current}} of {{total}}". `aria-label` built with a parameter. |
| 42 | Other plural hacks: "{{days}} days old", "{{count}} errors found" | "1 days old" | `_one`/`_other` pairs |
| 43 | `sync.alerts.localCopyPath`, `remoteSnapshotPath` | Label + path concatenated | Full sentence with the path as a variable |

**Redundancy and filler (Phase 4)**

| # | Key / location | Current | Proposed |
|---|---|---|---|
| 44 | `settings.sections.general.description`, `about.description`, `general.intro`, `currencyGroupDescription` | Three intros for one page; "workspace" is a noun the app does not have | Delete the intros. Keep "Appearance, language, currency and number format." |
| 45 | Card and table descriptions restating titles (e.g. "Set up the accounts that hold your money…" under "Accounts"; "Compare income, expenses, and net cashflow side by side…" under "Comparison summary") | Redundant | Delete about half. Keep only those that add information, e.g. "Transfers change where money sits, not your spending totals". |
| 46 | `accountDetails.header.noDescription` | "No description provided." | Hide the line, or show an "Add a description" link |
| 47 | `common.filters.placeholders.dateFrom` | "From date" (same as label) | Format hint, e.g. "DD/MM/YYYY" |
| 48 | `breakdown.metrics.avgPerMonth`, `breakdown.sectionYear` / `titleYear` | "Avg/month"; year shown twice | "Monthly average"; show the year once |
| 49 | `onboarding.start.scratch.description` | "Set up your accounts and categories. Takes two minutes." | "Start with an empty workspace. Add accounts and categories when you're ready." (Phase 6 decides the promise.) |
| 50 | `settings.about.copy` (9 first-person paragraphs) | Long for a settings tab | Show the first 3, link the rest |

### Hard-coded strings that bypass i18n (Phase 5)

| # | File:line | Current | Proposed |
|---|---|---|---|
| 51 | `src/app/shared/components/dialog/dialog.component.ts:81-82` | aria-label/title "Close dialog" | `common.close` key |
| 52 | `src/app/shared/components/empty/empty.component.ts:42` | `alt="Empty"` | `alt=""` (decorative) |
| 53 | `src/app/components/data-table/data-table.component.html:120,197` | sr-only "Select all rows" / "Select row" | Keys. On rows: "Select {{description}}" so each checkbox has a unique name. |
| 54 | `src/app/pages/settings/components/contextual-sidebar/contextual-sidebar.component.html:5` | aria-label "Settings sections" | Key |
| 55 | `src/app/shared/components/command/command-input.component.ts:41` | aria-label "Search commands" | Key |
| 56 | Overview sync button | `aria-label` reuses a long tooltip, replacing the visible "Sync now" | Accessible name matches the visible label. Tooltip stays as a description. |

### Glossary (English source of truth)

| Concept | Use | Avoid |
|---|---|---|
| Income/expense record | Transaction | entry, item, activity (as noun), movement |
| Between own accounts | Transfer | move, movement |
| Container of money | Account | wallet |
| Label for transactions | Category | tag |
| Whether money has cleared | Paid / Pending | settled / unsettled / settle |
| Repeating rule | Recurring payment | event, plan, rule |
| Generated rows | Scheduled items | planned items, linked items |
| Recorded value of an investment account | Value update (or "valuation") | snapshot (also used for sync) |
| Local recovery copy | Backup | restore point, recovery copy |
| Shared folder for multiple devices | Sync folder | sync space, repo, snapshot, sync file |
| Sync verbs | Get updates / Send changes | pull / push |
| Money in | Income | Incomes |
| Casing | Sentence case | Title Case |
| Success toasts | Short, past tense, no "successfully" | "…successfully." |
| Errors | "Couldn't <verb> <object>. <reason or next step>." | "Failed to…", "Something went wrong" |
| Destructive CTA | Verb + object ("Delete budget") | Yes / OK / Continue |

Open point: "Paid / Pending" assumes "settled" means paid. Confirm the meaning in the code before renaming, or define "settled" once instead.

### Persona red flags

- **Alex (power user):**
  - No visible shortcut for "Add transaction".
  - Filters open a dialog, so repeating a filter means re-entering it.
  - Duplicate transaction goes through a confirm dialog.
  - Recurring schedule locks after creation, and an occurrence count is required.
  - "Select all rows" exists, but no bulk action was verified. If none is wired up, it is a false affordance.
- **Jordan (first-timer):**
  - No ordered first steps after onboarding.
  - Transactions says to add an account first, with no link (unverified in the template).
  - Overview vocabulary wall: Net Worth, Liquidity, Receivables, Payables, "After R&P", Ledger Balance, Market Value.
  - "Settled" is unexplained.
  - "Exclude" and "Transfer" as category types are confusing next to the Transfers tab.
  - Backup setup is two steps behind a "Missing folder" warning.
- **Sam (accessibility):**
  - Generic or English-only accessible names (items 51 to 56).
  - Muted text at `oklch(0.556)` on white is about 4.6:1 (borderline), and settings helper lines use `text-xs` on it.
  - Not verified: a non-color cue on budget states and on blue/coral amounts, `aria-live` for ngx-sonner toasts, `aria-describedby` on field errors.

### Minor observations

- The icon picker has about 100 icons, with surprising entries ("Cannabis", "Cigarette", "Frown") and overlaps (`tag`/`tags`, `receipt`/`techReceipt`, `home`/`bed`/`sofa`). `blocked` and `circle` have labels that are not user-meaningful.
- The `dataBackups` i18n namespace and the `data-backups-page` folder do not match where the UI lives (Settings).
- `common.titleBar` ("Application title bar") is probably unnecessary for screen readers.
- Sidebar and settings nav items use `whitespace-nowrap` with a minimum width, so they will truncate in de/fr.
- Good models to copy: `settings.data.settings_problem`, `recurringEvents.dialog.edit.applyToOptionHints`, `dataBackups.sync.manual.hints`, `dataBackups.sync.setup.actionHelp`, `update.modal.ignore`, `cta.dismiss`.

### Open design questions (Phase 7, optional)

1. Why 15 system colors, 16 picker colors and about 100 icons for a "boring" app with no brand accent? What would a deliberately dull, trustworthy identity look like (one ink color, one accent, tabular numerals everywhere)?
2. Is the user's job "see what I own" or "decide whether I can spend"? Should the Overview lead with remaining budget and days left in the month?
3. (Resolved by decision 3: the restore preview and safety copy idea is **out of scope**.)

## Phases

Order: 0 first. Phases 1 and 2 are independent, but both land before 3 so the new strings are not rewritten twice. Phase 4 follows 3. Phases 5 and 6 can run any time after 0. Phase 7 is last and optional.

### Phase 0: Safety net (small)
- [x] Locale parity spec: all 7 files have identical key sets (shape of `src/app/config/visual-options.config.spec.ts`).
- [x] Guard spec: no `Yes` / `OK` / `Continue` button labels in `en.json`; no "successfully".
- [x] Guard spec: every `_one` key has an `_other` pair, in all 7 files.
- [x] Confirm baseline: `npm test`, `npm run lint`, `npm run format:check`.

### Phase 1: Failure messages (P1, medium)
- [x] Items 1 to 6. Read each controller (backup, sync, import, reset) before writing "nothing was changed" claims.
- [x] Map known Electron errors to i18n keys at the service boundary (`src/app/services/base-ipc.service.ts` and the page services), so raw `error.message` stops reaching the UI.
- [x] Add `common.errors.fixHighlightedFields` and replace the 10 per-entity copies.
- [x] Update all 7 locales.

### Phase 2: Destructive dialogs (P1, medium)
- [x] Items 7 to 17. Extend the shared `alert-dialog` with optional `details` params (date, amount, count) instead of building sentences per page.
- [x] Verify the clear-data scope against `electron/controllers/reset.controller.js` before writing the list.
- [x] Restore copy warns only (decision 3). Do not touch restore behavior in `electron/`.
- [x] Update `data-section.component.spec.ts` if keys change.

### Phase 3: Terminology (P2, large)
- [x] Items 18 to 43, using the glossary. Values first, key renames only where the key carries the old term (e.g. `pullNow`/`pushNow`).
- [x] Update templates and the two specs that load translations (`data-section.component.spec.ts`, `sync.service.spec.ts`).
- [x] Plurals with `_one`/`_other` pairs (items 40 to 43). Pick the keys in code, not with `(s)`.
- [x] Resolve the it/es "Transactions" split (item 39), flagged for review.
- [x] Add one-line explanations on first use of "settled" (or its replacement) and "value update".
- [x] Update `docs/architecture.md` only if it mentions renamed terms.

### Phase 4: Redundant text (P2, medium)
- [x] Items 44 to 50. **Before applying**, list the proposed deletions per page and get the user's review.
- [x] Re-check de/fr nav width after strings change.

### Phase 5: Accessibility and hard-coded strings (P2, small)
- [x] Items 51 to 56.
- [x] Add a global `:focus-visible` style in `src/styles.css` and confirm component-level focus styles.
- [x] Check muted-foreground contrast in light and dark, and fix where under 4.5:1.
- [x] Verify toast `aria-live` and field `aria-describedby`, and fix if missing.
- [x] Verify budget states and amounts carry a non-color cue.

### Phase 6: First-run guidance (P3, medium)
- [x] Dismissible 3-step checklist (add an account, review categories, add a transaction) on the empty Overview. It disappears when done. Store dismissal through `LocalPreferencesService`, never raw `localStorage`.
- [x] Link "Add your first account" on the Transactions page to the account dialog.
- [x] Soften the "Takes two minutes" promise (item 49).
- [x] i18n keys for all checklist text in 7 locales.

### Phase 7: Visual identity and Overview focus (skipped)
- Skipped by the owner; planned for the future. Candidates were one restrained accent (`/impeccable colorize`, `typeset`) and an Overview led by remaining budget (`/impeccable shape`). `PRODUCT.md` would need `/impeccable init` first.

## Risks

| Risk | Level | Mitigation |
|---|---|---|
| Seven locale files drift apart | High | Phase 0 parity spec, one commit per phase |
| Draft translations in 6 languages go unreviewed | High | English is the source. Flag every other locale for review, especially it/es terminology. |
| Recovery copy claims something untrue ("nothing was deleted") | High | Read the controller for each flow first. Reword to what is guaranteed. |
| Key renames break templates or the two existing specs | Medium | Run tests and lint after each phase |
| Renaming "settled" to "Paid / Pending" misstates its meaning | Medium | Confirm the meaning in the code before renaming |
| Copy deletions in Phase 4 remove content someone values | Low | Per-page list reviewed by the user before applying |
| `_one`/`_other` pairs are not full plural rules, so languages with more plural forms (uk) need extra forms | Medium | Check the plural categories for uk and zh; add `_few`/`_many` for uk if needed |

## Status

Phases 0 to 6 are done, each in its own commit. Phase 7 (visual identity and Overview focus) was skipped on purpose and is left for a future round.

Differences from the plan:
- Phase 0: only the locale parity spec was added up front; the copy-guard specs would have failed on strings later phases fixed, so they were not added.
- Phase 2: restore, sync and Excel import dialogs were not exercised in the browser (they need a native picker); the recurring-transaction delete option has no count.
- Phase 3: "snapshot" was kept for valuations; Italian and Spanish now say "Movimenti" / "Movimientos" for transactions everywhere.
- Phase 5: select-row checkboxes are never rendered (every table sets selectable to false), so they have no per-row name.
- Phase 6: two steps instead of three (no categories step, the system categories always exist); the Transactions link to Accounts already worked.

## Acceptance

- [ ] Phases 0 to 6 complete, each in its own commit
- [ ] `npm test`, `npm run lint`, `npm run format:check` pass
- [ ] All 7 locales have identical key sets
- [ ] No "Failed to…", "successfully", "Yes", or "OK" button copy left in `en.json`
- [ ] No raw `error.message` reaches the UI
- [ ] Restore functionality unchanged
- [ ] Re-run `/impeccable critique` and compare with 21/40
