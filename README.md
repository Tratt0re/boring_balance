# Expense Tracker

Desktop expense tracker built with Angular (renderer) and Electron (desktop shell).

## Development

Start Angular + Electron together:

```bash
npm run dev
```

This runs:
- `ng serve` on `http://localhost:4200`
- Electron in watch mode (`electronmon`)

## Build (Web Only)

Build the Angular renderer:

```bash
npm run build:web
```

Output goes to `dist/expense_tracker/browser`.

## Production Packaging (Desktop)

Create a production-ready desktop package for the current OS:

```bash
npm run dist
```

What this does:
- builds Angular in production mode
- packages the Electron app with `electron-builder`
- writes artifacts to `release/`

Platform-specific packaging:

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Create an unpacked app folder (useful for smoke testing packaging locally):

```bash
npm run build:desktop
```

## Tests

Run unit tests:

```bash
npm test
```

## Database Files (Dev vs Prod)

The Electron process stores SQLite files in:

`<userData>/data/`

Environment-based filenames:
- development (`app.isPackaged === false`): `expense-tracker.dev.db`
- production (`app.isPackaged === true`): `expense-tracker.db`

Optional override:
- set `EXPENSE_TRACKER_DB_ENV=dev` to force the dev DB file
- set `EXPENSE_TRACKER_DB_ENV=prod` to force the prod DB file
