# Boring Balance landing page

This repository contains the Boring Balance landing page source.

## Stack

- Angular 21 standalone application
- Static prerendering with client hydration
- Tailwind CSS 4
- Shared light/dark theme tokens and local font assets

## Development

```bash
npm install
npm start
```

The dev server runs on `http://localhost:4200/`.

## Build

```bash
npm run build
```

The build prerenders the landing page and uses `--base-href ./` so the generated files are suitable
for GitHub Pages-style static hosting. Deploy the contents of `dist/boringbalance/browser/`.
