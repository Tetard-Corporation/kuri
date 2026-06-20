# 🍳 Kuri — your offline recipe keeper

A light, **free**, offline-first web app to store your recipes, cook them
step-by-step, organize them into lists, and build a combined shopping list.
A simple, no-frills recipe app — runs entirely in your browser, hosted for
free on GitHub Pages.

> Everything is stored **locally on your device** (IndexedDB). No account, no
> server, no tracking. Use **Import → Export** to back up or move your data.

## Features

- 📚 **Store & browse recipes** — searchable library, filter by tag, photo or emoji covers.
- 👨‍🍳 **Cook mode** — distraction-free, full-screen, step-by-step view that keeps the screen awake.
- 🍽️ **Smart servings** — scale ingredient quantities up or down on the fly.
- 📋 **Lists** — group recipes ("This week", "Desserts", …) plus an automatic Favorites list.
- 🛒 **Shopping list** — pick recipes and Kuri merges their ingredients into one categorized, check-off list (e.g. `200 g + 100 g flour → 300 g flour`). Export to **Apple Reminders** (via a one-time Shortcut), Share, or Copy.
- 📥 **Import recipes** from:
  - **a website URL** — reads schema.org/Recipe structured data when present;
  - **pasted text** — e.g. an Instagram caption or a note;
  - **a photo** — on-device OCR (via Tesseract.js) reads the text, no upload.
- 💾 **Backup & restore** — export/import all your data as a single JSON file.
- 📴 **Installable PWA** — works fully offline once loaded; "Add to Home Screen".

## Run it locally

It's a zero-build static site — just serve the folder:

```bash
python3 -m http.server 8099
# then open http://localhost:8099
```

(A server is needed because the app uses ES modules and a service worker;
opening `index.html` via `file://` won't work.)

## Deploy to GitHub Pages (free)

1. Push this repository to GitHub.
2. **Settings → Pages → Build and deployment**.
3. Source: **Deploy from a branch**, branch: your branch, folder: **`/ (root)`**.
4. Open the published URL. On your phone, use **Add to Home Screen** to install it.

All paths are relative, so it works from a project subpath
(`https://<user>.github.io/<repo>/`) without configuration.

## Notes on importing

- **From a URL:** browsers can't fetch other websites directly (CORS), so URL
  import routes the request through public read-only proxies. If a site can't
  be reached, copy the recipe text and use **Paste text** instead — that always
  works offline.
- **From a photo:** the OCR engine (~few MB) is downloaded on first use from a
  CDN and then cached for offline use. Accuracy depends on the photo quality.

## How it's built

Plain HTML/CSS/vanilla JavaScript (ES modules) — **no build step, no
dependencies to install**. Data lives in IndexedDB; a service worker
(`sw.js`) caches the app shell for offline use.

```
index.html            app shell, tab bar
manifest.webmanifest  PWA manifest
sw.js                 service worker (offline cache)
css/styles.css        styles (light/dark)
js/
  app.js              routes + startup
  router.js           hash router
  db.js               IndexedDB wrapper
  store.js            recipes/lists repository + seed data
  parse.js            ingredient & recipe-text parsing, shopping aggregation
  import.js           URL/JSON-LD import + photo OCR
  ui.js               DOM helpers, modals, toasts
  views/              one module per screen
```
