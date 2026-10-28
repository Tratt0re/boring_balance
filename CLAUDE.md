# Project Instructions

Boring Balance: local-first personal finance desktop app. Angular renderer + Electron main process + SQLite (better-sqlite3). See `docs/architecture.md` for the full pattern guide.

## Tech Stack
- TypeScript ~5.9, Angular 21 (standalone components, signals), Tailwind CSS 4, ECharts via ngx-echarts
- Electron 40, better-sqlite3 (native module, rebuilt in `postinstall`)
- i18n via @ngx-translate, locales in `public/i18n/*.json`
- Plain JavaScript (CommonJS) in `electron/`, no TypeScript there

## Code Style
- Prettier: printWidth 100, single quotes, Angular parser for `*.html` (config in `package.json`)
- EditorConfig: 2-space indent, UTF-8, final newline
- File names: kebab-case with a domain suffix (`accounts.controller.js`, `accounts.service.ts`, `transactions.model.ts`)
- Domain names match across layers: DTO, service, controller, model, page
- Path alias `@/*` maps to `src/app/*`
- Use `LocalPreferencesService`, never raw `localStorage`
- Services wrap IPC (`extends BaseIpcService<APIChannel.X>`) and map DTOs to frontend models

## Architecture Rules
- Angular never touches SQLite, the filesystem, or Node APIs. Access goes through `window.electronAPI` via a service, never from a component.
- Every IPC channel is typed in `src/app/config/api.ts`. Channel names are declared in `electron/ipc/channels.js`.
- Electron controllers validate every payload (`ensurePlainObject`, `assertAllowedKeys`, etc. from `electron/controllers/utils.js`) before calling a model.
- Electron models (`electron/models/*.model.js`) are the only place with SQL. Controllers do not write SQL.
- Models return plain row objects. Frontend models in `src/app/models/` convert cents to amounts and flags to booleans.
- Schema changes go in `electron/database/schemas/` (numbered `NNN_name.sql`) plus `migrations.js`.

## Testing
- Run tests: `npm test` (Angular unit-test builder via `ng test`)
- Test pattern: `*.spec.ts` next to the source file. Only `src/app/app.spec.ts` exists today, so coverage is minimal.
- Coverage: not configured

## Build & Run
- Install: `npm install` (`postinstall` runs `electron-rebuild` for better-sqlite3)
- Dev: `npm run dev` (ng serve on :4200, preload watch, Electron)
- Build renderer: `npm run build`
- Build preload: `npm run build:preload` (esbuild, outputs `electron/preload.bundle.cjs`)
- Production build + package: `npm run build:prod`, then `npm run dist:mac` / `dist:win` / `dist:linux`
- Lint: none configured. Format with Prettier.
- DB environment override: `BORINGBALANCE_DB_ENV=dev|prod`

## Known Gaps
- `scripts/build-preload.js` requires `esbuild`, which is not in `package.json`. It only resolves transitively via the lockfile. Add it to devDependencies.

## Project Structure
- `src/app/pages/`: route-level pages, each with optional feature-local `services/`
- `src/app/services/`: shared IPC-backed services
- `src/app/models/`: frontend model classes (`fromDTO` / `toDTO`)
- `src/app/dtos/`: IPC contract types
- `src/app/config/`: IPC channel contract, preference keys, menu, ECharts config
- `electron/main.js`, `electron/window.js`, `electron/preload.js`: Electron entry points
- `electron/controllers/`: validation and application logic, one per domain
- `electron/models/`: SQLite persistence per domain
- `electron/database/`: connection, migrations, schema SQL

## Conventions
- Commit style: lowercase conventional prefixes, e.g. `feat: ...`, `fix: ...`, `doc: ...`, `version: x.y.z`. Some commits combine two prefixes.
- Branches: `main` (releases), `develop`, plus `github-page` and `website`. PRs target `main`.
- Error handling: Electron throws `Error` with specific messages. Angular services catch at the boundary and show toasts (`ngx-sonner`).
- **Follow existing patterns.** Reuse existing functions and utilities; match the surrounding code's style.
- **Ask first** before creating a new function/utility with no similar existing counterpart (say what and why),
  and before adding any npm dependency.
- **When requirements are unclear, ask.** Analyze the involved files and present a plan before larger changes.
- Electron owns all file-system and sync logic; Angular is UI plus minor calculations.
- Angular: standalone components, signals, `inject()`, `@/` path alias, `ChangeDetectionStrategy.OnPush` in the
  shared library, user-facing strings through i18n keys.
