# Beeable App — Hello World

The starter template for **Beeable apps**, designed to be forked in [Lovable](https://lovable.dev) and deployed into the Beeable app runtime.

This is a **fork-and-modify** template, not a library. Clone it, rename, and start building. The example is intentionally minimal — a single `greetings` collection, a form, a list, a menu bar, LLM + cross-app SDK demos, and four documented HTTP endpoints. Enough to exercise every contract a Beeable app must honor, and nothing more.

## What's in the box

- **Vite + React + Tailwind** frontend in `src/`
- A working **window** + **fullscreen** view pair (the two modes every Beeable app must support)
- A **menu bar** declared via the SDK's `declareMenu` / `onMenuAction` bridge (host-painted, so it's outside the iframe)
- A SQLite-backed **collection** (`greetings`) accessed via the app's own Express routes — no auto-CRUD; apps own their entire HTTP surface
- **`server/routes.js`** with four `@openapi`-annotated routes (`GET` / `POST` / `DELETE /greetings`, plus a stateless `GET /hello/{name}`)
- **`scripts/generate-openapi.mjs`** that turns those JSDoc blocks + `manifest.json` into a valid `openapi.json` the orchestrator and other apps can discover
- Live **SDK demos** in the fullscreen view: `beeable.llm.chat(...)` for a browser-side LLM call, and `beeable.app(appId).get(...)` for a cross-app HTTP call through the platform proxy
- The Beeable SDK pinned to **`latest`** (the runtime overrides it at request time with its canonical version anyway — leaving the Lovable preview on `latest` keeps the fresh published copy with no maintenance)

## Structure

```
src/                 React frontend (runs in Lovable preview AND production)
  App.jsx            Mode-switching root component (window vs fullscreen)
  main.jsx           React root
  data.js            Thin fetch wrappers around /greetings + /hello/{name}
  views/
    WindowView.jsx     Compact dock widget — shows count + latest greeting
    FullscreenView.jsx Full surface — form, list, menu bar, About dialog

server/              Express backend (runs ONLY in production)
  routes.js          Custom routes + @openapi JSDoc blocks
  README.md          Server-side rules

manifest.json        App metadata, databases, collections
openapi.json         GENERATED from server/routes.js + manifest.json
scripts/
  generate-openapi.mjs  The generator

AGENTS.md            Required reading for the Lovable agent
```

## Local commands

```bash
npm install        # install frontend deps
npm run dev        # Vite preview at http://localhost:5173
npm run build      # production frontend build
npm run build:api  # regenerate openapi.json from server/routes.js
```

## How Lovable fits in

Lovable knows how to write React. It does **not** know how to write Express routes, manage SQLite, or speak the Beeable runtime's conventions. The template solves this by:

1. **Putting the load-bearing instructions in `AGENTS.md`** — Lovable's agent reads this file and follows the decision tree for where new features should land.
2. **Keeping the backend invisible to Vite's preview** — `server/` is never imported from `src/`, so broken backend code can't break the live preview. Lovable can write whatever it wants in `server/routes.js` without visual regressions.
3. **Generating OpenAPI from JSDoc comments** — when Lovable writes a route, it writes the handler + a JSDoc `@openapi` block, and the generator produces `openapi.json` automatically. Lovable never touches `openapi.json` directly.

## The two views

Every Beeable app renders in two modes, both served from the same `index.html`:

- `/apps/{id}/window` — a compact dock widget the host shows alongside the chat. Information-dense, read-only, glanceable.
- `/apps/{id}/fullscreen` — the full app surface. Where the real work happens.

`src/App.jsx` inspects `window.location.pathname` and picks the right view. In Lovable's preview the URL is just `/`, which falls through to fullscreen — navigate to `/window` in the preview URL bar to inspect the widget.

## The menu bar

The host renders its own chrome above the iframe. The app can't paint there directly, so menus travel over `postMessage`:

```js
import { ready, declareMenu, onMenuAction } from '@witnium/beeable-sdk/app-runtime';

ready();
declareMenu([
  { id: 'file', label: 'File', children: [{ id: 'clear', label: 'Clear all' }] },
]);
onMenuAction((action) => { if (action === 'clear') /* ... */ });
```

In the Lovable preview there is no parent host to receive the message — the calls become silent no-ops. The same code runs cleanly in both environments.

## Deploy

Beeable app deployment is handled by the platform — see the main Beeable docs for the install/sync flow. The deploy step:

1. Pulls this repo into the app runtime
2. Runs `npm install`
3. Runs `npm run build:api` to regenerate `openapi.json`
4. Validates the spec and the route handlers
5. Hot-reloads the app with no downtime

Every app gets its own SQLite database, its own URL paths under `/apps/{id}/`, and its routes auto-registered as orchestrator tools.

## Read this before editing

**[AGENTS.md](AGENTS.md)** — the rules for how to edit this template safely. Required reading whether you're a human or an LLM.
