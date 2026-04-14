# AGENTS.md — instructions for the Lovable agent

You are working on a **Beeable app**. Beeable apps are not pure frontend projects. They have a small Express backend that runs in production but never executes in this preview. Read this file before making changes — the rules below are not negotiable.

## The two halves of this repo

```
src/             ← React frontend. RUNS in this preview. Vite + React + Tailwind.
server/          ← Express backend. RUNS ONLY IN PRODUCTION inside the Beeable app runtime.
manifest.json    ← Shared config. Declares collections, databases, app metadata.
openapi.json     ← GENERATED artifact. Never edit by hand.
scripts/         ← Build scripts (OpenAPI generator). Don't modify unless asked.
```

`src/` and `server/` are two separate programs. The frontend talks to the backend over HTTP — it must never `import` anything from `server/`. Vite's watcher is configured upstream to ignore `server/`, so changes there will not show in this preview, and that is correct. Your preview can be fully working while `server/routes.js` is broken; conversely, your preview can be broken while production works fine.

## What can run where

|                              | Lovable preview | Production |
|------------------------------|:---------------:|:----------:|
| `src/` React UI              | yes             | yes        |
| `req.collection(...)` in routes | no           | yes (SQLite) |
| `onDataChanged()`            | no-op           | yes (SSE)  |
| `declareMenu()` / `onMenuAction()` | no-op     | yes (host paints the bar) |
| `beeable.app(...)` calls     | network error   | yes        |
| `beeable.api.*` calls        | network error   | yes        |
| `beeable.llm.chat()`         | network error   | yes        |
| `server/routes.js`           | does not run    | yes        |

The SDK lives in the `@witnium/beeable-sdk/app-runtime` npm package and auto-detects which environment it's in. Same code works in both. **Don't add `if (preview) ... else ...` branches** — the SDK already does that under the hood. Just call the methods normally and let preview-only failures surface as errors.

## Decision tree: where does this feature go?

When the user asks for a feature, walk this list top-to-bottom and stop at the first match.

1. **Pure UI** (layouts, forms, styling, animations, navigation between screens) → edit `src/`. Don't touch anything else.

2. **Persistent data** (lists, records, anything that survives a refresh) → declare the collection in `manifest.json` under `"collections"` (this creates the SQLite table), then write explicit routes for every operation in `server/routes.js` with `@openapi` JSDoc blocks. The frontend talks to those routes via thin `data.js` wrappers — never via a hidden CRUD path.

   **Why the explicit-route discipline**: every public operation has a real schema in `openapi.json`, so the LLM and external apps see the same well-typed contract that your frontend uses. There is no auto-CRUD shortcut.

3. **Custom server logic** (sending email, calling another app, calling an external API, computing aggregates, anything that can't run in the browser) → add another handler to `server/routes.js` AND a `@openapi` JSDoc block above it (see "Adding a custom route" below). Then call it from `src/` via the same `data.js` pattern.

4. **Calling another Beeable app** → use `beeable.app('other-app-name').get('/path')` directly from `src/`. No server code needed unless you're wrapping it.

5. **LLM completion** → use `beeable.llm.chat([{ role: 'user', content: '…' }])` directly from `src/`. No server code needed.

6. **A new menu item** → extend the `declareMenu([...])` call in `FullscreenView.jsx` and handle the new `id` in the `onMenuAction` callback. The host paints the bar; your app handles the click.

If your feature touches more than one of the categories above, do them in order.

## Window vs Fullscreen views

The Beeable runtime serves this app at TWO URLs:

- `/apps/{id}/window` — a small dock widget shown alongside the chat. Information-dense, read-only, glanceable.
- `/apps/{id}/fullscreen` — the full app. Where users do real work.

Both URLs serve the same `index.html`. `src/App.jsx` looks at `window.location.pathname` and renders either `WindowView` or `FullscreenView`. **Always keep both views working.** Window mode is what users see most of the time — a fullscreen-only app is broken.

When you add a feature, ask yourself: does the window view need to reflect this? If a new greeting is added, the window count and latest-greeting preview update automatically — good. If you add a whole new entity, surface a summary of it in the window view too.

In Lovable's preview the URL is just `/`, which falls through to fullscreen mode. To preview the window mode locally, navigate to `/window` in the preview URL bar.

## The menu bar

The Beeable host paints chrome above the app iframe — the app itself cannot render there. To put items in that bar the app declares them via a `postMessage` through the SDK:

```js
import { ready, declareMenu, onMenuAction } from '@witnium/beeable-sdk/app-runtime';

ready();
declareMenu([
  { id: 'file', label: 'File', children: [{ id: 'clear', label: 'Clear all' }] },
  { id: 'help', label: 'Help', children: [{ id: 'about', label: 'About' }] },
]);
return onMenuAction((action) => {
  if (action === 'clear') { /* ... */ }
  if (action === 'about') { /* ... */ }
});
```

Rules:

- `ready()` should be called once, at mount time. It tells the host the app has booted.
- `declareMenu(items)` is idempotent — call it again whenever the menu structure changes (e.g. after loading data).
- `onMenuAction` returns an unsubscribe function. Return it from `useEffect` so React cleans up correctly.
- In the Lovable preview there is no parent host — these calls become silent no-ops. You do NOT need to feature-detect.
- Keep menus shallow (one level of children). Deep nested menus are a smell; most features belong in the fullscreen UI itself.

## Adding a custom route (the only "API" you write)

Custom routes live in `server/routes.js`. Each route has a `@openapi` JSDoc block above it that describes the operation in OpenAPI 3.0 YAML, with `path` and `method` fields prepended. Example:

```js
/**
 * @openapi
 * path: /hello/{name}
 * method: get
 * operationId: say_hello
 * summary: Stateless greeting
 * description: |
 *   Returns a friendly greeting for `name` without writing to the
 *   collection.
 * tags: [greetings]
 * parameters:
 *   - { name: name, in: path, required: true, schema: { type: string } }
 * responses:
 *   '200':
 *     description: A greeting
 *     content:
 *       application/json:
 *         schema:
 *           type: object
 *           properties:
 *             message: { type: string }
 */
router.get('/hello/:name', async (req, res) => {
  res.json({ message: `Hello, ${req.params.name}!` });
});
```

Rules for the JSDoc block:

- The block MUST start with `@openapi` on the first content line.
- The body MUST be valid YAML once the leading ` * ` prefix is stripped from each line.
- `path` and `method` are required.
- Use a unique, descriptive `operationId`. The orchestrator turns each `operationId` into a tool name, so make it human-readable: `list_greetings`, `create_greeting`, not `op1` or `handler`.
- Always include a meaningful `summary` and `description`. Other apps and the orchestrator use these to decide when to call your route.
- Always document the response shape. `'200'` at minimum. `'404'`, `'400'`, `'500'` when applicable.

After editing routes, run `npm run build:api` to regenerate `openapi.json`. **Never edit `openapi.json` by hand** — your edits will be lost.

## Codegen: two directions

Two independent code-generators sit on either side of `openapi.json`. Understand which one you're feeding before you edit anything.

```
server/routes.js               openapi.json                  typed TS client
  (JSDoc @openapi blocks)  →   (committed artifact)   →      (generated on demand by the platform)
  ↑ you edit this                ↑ never edit by hand          ↑ other apps fetch this, you don't
```

**1. JSDoc → `openapi.json` (runs locally, at deploy time)**
`scripts/generate-openapi.mjs` reads `server/routes.js`, extracts every `@openapi` JSDoc block, parses the YAML body, and writes `openapi.json`. Triggered by `npm run build:api`. The deploy pipeline runs it automatically. The orchestrator reads `openapi.json` to turn each `operationId` into a callable tool.

**2. `openapi.json` → typed TypeScript client (runs on the platform)**
The Beeable platform exposes `GET /api/apps/discover/{appPath}/sdk` which returns a single-file TypeScript SDK generated from the app's OpenAPI spec — type aliases for every schema, a typed async function per operation, and a React Query hook per operation. Other apps (or external consumers) fetch this via `fetchAppSdk` from `@witnium/beeable-sdk/apps`:

```ts
// In another app, or an external Node consumer
import { fetchAppSdk } from '@witnium/beeable-sdk/apps';

await fetchAppSdk({
  baseUrl: 'https://api.beeable.dev/api',
  token: process.env.BEEABLE_TOKEN,
  appPath: 'hello-world',
  outputPath: './src/api/hello-world.ts',
});

// Then in their code:
import * as helloWorld from './api/hello-world';
await helloWorld.create_greeting({ name: 'Alice' }); // typed!
```

**What this means for you**:
- The quality of `openapi.json` dictates the quality of the typed client every downstream consumer gets. Tight schemas (`required`, `format`, precise response types) translate into compile-time safety for other apps.
- The function names in the typed client come from your `operationId` values. `list_greetings` becomes `list_greetings()`. Keep them snake_case and descriptive.
- You do NOT generate the typed client yourself. The platform does it on demand. You just write great JSDoc.

## Server route surface (what you can use inside a handler)

You may import ONLY `Router` from `express`. Inside a handler you have:

- `req.collection(name, opts)` — read/write a SQLite-backed collection. Methods: `find(filter)`, `findOne(id)`, `insert(doc)`, `update(id, changes)`, `remove(id)`, `count(filter)`. Always pass the same `{ version, normalize }` opts you use elsewhere — keep a `collections` object at the top of `routes.js` and reuse it.
- `req.beeableApi(method, path, body)` — calls the Beeable platform API with the user's auth forwarded. Use this for sending email, accessing files, calling integrations, etc. The path starts with `/` and is appended to the platform's `/api` base.
- `req.body`, `req.params`, `req.query` — standard Express request fields. Body is already JSON-parsed.
- `res.json(obj)`, `res.status(code).json(obj)`, `res.status(204).end()` — standard Express response helpers.

You may NOT use:

- `fs`, `path`, `os`, `child_process`, or any Node built-in for I/O. Data lives in collections, not files.
- `process.env` — config does not live in env vars. If you need a credential, it's exposed via a Beeable platform integration; call it with `req.beeableApi`.
- `console.log` for production logging — use it sparingly for debugging. All real outcomes should go through `res.json` / `res.status`.
- npm packages other than `express`. Do not add `axios`, `node-fetch`, `nodemailer`, `pg`, `mysql2`, anything else. If you think you need one, you're solving the wrong problem in the wrong place — go back to the decision tree and try step 4 (call another Beeable app) or step 3 (use `req.beeableApi`).
- `import` from `../src/...`. The two halves of the repo never reference each other.

## The in-app SDK (`@witnium/beeable-sdk/app-runtime`)

The SDK is pre-installed and auto-detects preview vs production. Import only what you need. Every export falls into one of three groups:

**Host bridge (postMessage to the Beeable shell)**
```js
import { ready, declareMenu, clearMenu, onMenuAction, requestSelect } from '@witnium/beeable-sdk/app-runtime';

ready();                                             // tell the host the app has booted
declareMenu([{ id: 'file', label: 'File', children: [{ id: 'new', label: 'New' }] }]);
clearMenu();                                         // remove all menu items
const unsub = onMenuAction((action) => { /* ... */ }); // listen for clicks — returns unsubscribe
requestSelect();                                     // programmatically ask the host to focus this app
```

All of these are silent no-ops in the Lovable preview (no parent host). Call them normally — no feature-detection.

**Live data signals**
```js
import { onDataChanged } from '@witnium/beeable-sdk/app-runtime';

const unsub = onDataChanged(() => refetch()); // SSE in production, no-op in preview
```

Use after any mutation so window + fullscreen views stay consistent. The server publishes the event automatically whenever a `req.collection()` write completes.

**Platform + cross-app + LLM**
```js
import { beeable, appId, basePath } from '@witnium/beeable-sdk/app-runtime';

// Platform API (runs as the current user)
await beeable.api.get('/memories');
await beeable.api.post('/files', { name: 'note.md', content: '…' });

// Call another Beeable app by name
await beeable.app('calendar').get('/events');
await beeable.app('contacts').post('/contacts/abc/email', { subject, body });

// Call YOUR OWN app (the way another app would) — use the exported appId
await beeable.app(appId).get('/hello/world');

// LLM completions (OpenAI-compatible shape)
const res = await beeable.llm.chat(
  [{ role: 'user', content: 'Summarize: …' }],
  { model: 'claude-sonnet-4-6' },
);
const text = res?.choices?.[0]?.message?.content;

// URL helpers
appId;     // this app's UUID — inject into links or cross-app calls
basePath;  // base path the runtime serves this app from — use as React Router basename
```

In the Lovable preview these all reject with a network error (there's no platform to call). That's expected — wrap in `try/catch` and surface the error to the user instead of feature-detecting.

## Frontend conventions (`src/`)

- React + Tailwind, function components, hooks. No class components.
- All data access goes through `src/data.js` thin wrappers around the app's own `/greetings` (and friends) routes. The frontend hits the same documented HTTP surface that external callers (Buzz, other apps) use — there is no SDK `collection()` helper anymore.
- Centralize the `data.js` helpers; don't sprinkle raw `fetch()` calls through components.
- Use `onDataChanged(callback)` to refresh after a mutation. In production it subscribes to a server-side SSE stream. In the preview it's a no-op — that's fine, the same code works in both.
- Use `appId` exported from the SDK when you need this app's id for `beeable.app(appId).post(...)`. Don't hardcode it.
- Tailwind only. Don't add Shadcn, Mantine, MUI, Chakra, or any other component library — they bloat the bundle and the runtime base image doesn't optimize for them. Build your own components from Tailwind utilities, or copy primitives inline.
- Keep both `WindowView` and `FullscreenView` updated when you add features that should appear in both surfaces.

## `manifest.json`

- `name`: URL-safe k8s-style identifier, unique within the namespace. Don't change this casually.
- `displayName`: optional human label for the UI.
- `databases`: alias → `"namespace/name"`. Almost always `{ "default": "<name>/<name>" }`. The runtime maps this to a SQLite file at `/app/data/<namespace>/<name>/data.db`.
- `collections`: array of collection names. Each becomes a SQLite JSON document table. **Adding a name only creates the table** — you must also write explicit `@openapi`-documented routes in `server/routes.js` for every operation you want to expose. There is no auto-CRUD shortcut.

## What never to do

- Never `import` from `server/` into `src/` or vice versa. Hard rule.
- Never edit `openapi.json` by hand. It is regenerated from `manifest.json` + `server/routes.js`.
- Never delete `server/routes.js` or `manifest.json`, even if they look unused. They are load-bearing.
- Never add server-only npm packages (`postmark`, `nodemailer`, `axios`, `pg`, `redis`, `aws-sdk`, …) to `package.json`. The runtime provides everything you need via `req.beeableApi`.
- Never add component libraries (`shadcn`, `mui`, `mantine`, `chakra`, `radix-ui`, …) to `package.json`. Tailwind only.
- Never put secrets, API keys, tokens, env vars, or connection strings in this repo. Credentials live in the Beeable platform and arrive via `req.beeableApi`. If you find yourself needing one, you're missing a Beeable integration — say so to the user instead of hardcoding.
- Never bump `@witnium/beeable-sdk` to a pinned version — leave it at `"latest"`. The Beeable runtime overrides the SDK at request time with its own canonical version anyway, but `latest` keeps the Lovable preview using the freshest published copy with no maintenance.
- Never remove the `WindowView` or `FullscreenView` files. Both modes must always render something sensible.

## When you complete a task

Make a quick mental check before finishing:

1. Did I change `manifest.json`'s `collections`? If yes, regenerate `openapi.json` (`npm run build:api`).
2. Did I add or change a route in `server/routes.js`? If yes, the route must have a `@openapi` JSDoc block, and I must regenerate `openapi.json`.
3. Did I add a menu item? If yes, is it handled in `onMenuAction`, and does `declareMenu` still run at mount?
4. Did I add a feature that should appear in the window view? If yes, update `src/views/WindowView.jsx`.
5. Did I add any imports to `src/` that point at `server/`? If yes, remove them — that's the one rule.
6. Did I add any npm packages? If yes, are they on the allowed list (React + Tailwind ecosystem)? If they're server-side, go back and use `req.beeableApi` instead.
