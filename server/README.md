# server/

This directory contains the **server-side** code for the app. It runs ONLY in production, inside the Beeable app runtime — never in the Lovable preview, never in `vite dev`.

## What lives here

- `routes.js` — an Express router exporting custom HTTP endpoints. Each handler has a `@openapi` JSDoc block above it that describes the operation.

## What does NOT live here

- There is no auto-CRUD. Every public operation is a deliberate route in `routes.js` with a matching `@openapi` JSDoc block — that's the single contract the frontend, other apps, and the orchestrator all see.
- Anything that isn't HTTP — there's no background workers, no scheduled jobs, no file I/O. If you need any of that, do it from another Beeable system, not from inside this app.

## Why it's isolated from `src/`

`src/` is a Vite + React app that runs in two environments: the Lovable preview (no backend) and the production runtime (real backend). For both to work cleanly, the React code must never `import` anything from `server/`. Vite's watcher is configured to skip this directory (`app-runtime/src/vite-app.ts:295`), so changes here will not trigger HMR — but they WILL be picked up the next time the runtime reloads the module.

## How the routes get called

In production the runtime mounts this router at `/apps/{id}/api/`. So a route declared as `router.post('/greetings', ...)` is reachable at:

- From inside this app's UI: via the `data.js` helpers (which `fetch` the proxied path)
- From another Beeable app: `beeable.app('hello-world').post('/greetings', body)`
- From the orchestrator: as an auto-generated tool whose name comes from the `operationId` in the JSDoc block

## Editing routes

When you change a route, edit BOTH the handler and its `@openapi` JSDoc block. Then run `npm run build:api` from the project root to regenerate `openapi.json`. The deploy pipeline does this automatically — running it locally is only useful for catching mistakes early.

**Never edit `openapi.json` directly.** It's a generated artifact and your changes will be overwritten on the next build.

## Allowed surface

You may import only `Router` from `express`. Inside a handler you have:

- `req.collection(name, opts)` — returns a collection client backed by SQLite. Read/write JSON documents.
- `req.beeableApi(method, path, body)` — calls the Beeable platform API with the user's auth forwarded.
- `req.body / req.params / req.query` — standard Express request fields.
- `res.json(...) / res.status(...).json(...)` — standard Express response helpers.

That's it. No `fs`, no `process.env`, no third-party npm packages. If you reach for one, you're solving the wrong problem in the wrong place — see the project's `AGENTS.md` for the decision tree.
