# Boring Balance

Desktop Boring Balance app built with Angular (renderer) and Electron (desktop shell).

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

Output goes to `dist/boringbalance/browser`.

## Local Production Build Flow

Build renderer + Electron preload for production:

```bash
npm run build:prod
```

Run Electron in local production mode (loads built files, no dev server):

```bash
npm run electron:prod
```

Create an unpacked app folder for the current OS:

```bash
npm run build:desktop
```

Create distributable artifacts:

```bash
npm run dist
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Artifacts are written to `release/`.

### Windows artifacts (`npm run dist:win`)

Expected output:
- `release/boring-balance-setup-<version>-x64.exe`
- `release/boring-balance-setup-<version>-x64.exe.blockmap`
- `release/boring-balance-portable-<version>-x64.exe`
- `release/win-unpacked/`

Note for non-Windows hosts:
- Windows packaging depends on Wine/NSIS tooling available to `electron-builder`.

## Tests

Run unit tests:

```bash
npm test
```

## Packaged Build Checklist

- [ ] Packaged app starts without relying on `ng serve`.
- [ ] Renderer loads correctly in packaged mode.
- [ ] SQLite database initializes under `<userData>/data/`.
- [ ] App icons/assets/templates are available at runtime.
- [ ] Import/export flows complete without file path errors.
- [ ] Backup/restore and sync-related file operations still work.
- [ ] Windows artifacts are generated in `release/`.
- [ ] Installer and portable Windows artifacts are both generated and launch.

## Database Files (Dev vs Prod)

The Electron process stores SQLite files in:

`<userData>/data/`

Environment-based filenames:
- development (`app.isPackaged === false`): `boringbalance.dev.db`
- production (`app.isPackaged === true`): `boringbalance.db`

Optional override:
- set `BORINGBALANCE_DB_ENV=dev` to force the dev DB file
- set `BORINGBALANCE_DB_ENV=prod` to force the prod DB file
