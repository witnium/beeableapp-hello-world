import { Router } from 'express';

// ── How this file works ────────────────────────────────────────────
//
// This file runs ONLY in production inside the Beeable app runtime.
// It is never imported from `src/` and never executes in the Lovable
// preview — Vite's watcher is configured to ignore `server/`.
//
// You may use:
//   - `import { Router } from 'express'`  (the only allowed import)
//   - `req.collection(name, opts)`        (read/write SQLite collections)
//   - `req.beeableApi(method, path, body)` (call the Beeable platform API)
//   - `req.body / req.params / req.query`  (standard Express)
//   - `res.json(...) / res.status(...)`    (standard Express)
//
// You may NOT use: fs, path, process, child_process, env vars, or any
// npm package other than express. If you think you need one, you're
// putting logic in the wrong place — see AGENTS.md.
//
// ── OpenAPI generation ─────────────────────────────────────────────
//
// EVERY public operation gets a `@openapi` JSDoc block. The block
// body is YAML following the OpenAPI 3.0 operation shape, with `path`
// and `method` added at the top. `scripts/generate-openapi.mjs`
// parses these blocks and produces `openapi.json`. There is no
// auto-CRUD shortcut — what's in openapi.json IS the public surface,
// used identically by this app's frontend and any external caller
// (Buzz, other apps).
//
// NEVER edit openapi.json by hand. Edit the JSDoc blocks here, then
// run `npm run build:api` (or let the deploy pipeline do it).

const router = Router();

// ── Collection config ──────────────────────────────────────────────
//
// `greetings` is stored in SQLite via the runtime's collection layer.
// Version + normalize are passed to req.collection(...) on every
// access so migrations run on read.

const GREETINGS_VERSION = 1;

function normalizeGreeting(doc) {
  // Add migrations here as the schema evolves:
  //   if (!doc._v || doc._v < 2) doc.locale = 'en';
  doc._v = GREETINGS_VERSION;
  return doc;
}

export const collections = {
  greetings: { version: GREETINGS_VERSION, normalize: normalizeGreeting },
};

// ── Greetings API ──────────────────────────────────────────────────

/**
 * @openapi
 * path: /greetings
 * method: get
 * operationId: list_greetings
 * summary: List all greetings, newest first
 * tags: [greetings]
 * responses:
 *   '200':
 *     description: Array of greetings
 *     content:
 *       application/json:
 *         schema:
 *           type: array
 *           items:
 *             type: object
 *             required: [id, name, message, created_at]
 *             properties:
 *               id:         { type: string }
 *               name:       { type: string }
 *               message:    { type: string }
 *               created_at: { type: string, format: date-time }
 */
router.get('/greetings', async (req, res) => {
  try {
    const greetings = req.collection('greetings', collections.greetings);
    const all = await greetings.find();
    all.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * path: /greetings
 * method: post
 * operationId: create_greeting
 * summary: Record a greeting for someone
 * tags: [greetings]
 * requestBody:
 *   required: true
 *   content:
 *     application/json:
 *       schema:
 *         type: object
 *         required: [name]
 *         properties:
 *           name: { type: string, minLength: 1, description: 'Who to greet.' }
 * responses:
 *   '200':
 *     description: The stored greeting
 *   '400':
 *     description: name missing
 */
router.post('/greetings', async (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  try {
    const greetings = req.collection('greetings', collections.greetings);
    const created = await greetings.insert({
      name: name.trim(),
      message: `Hello, ${name.trim()}!`,
      created_at: new Date().toISOString(),
    });
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * path: /greetings
 * method: delete
 * operationId: clear_greetings
 * summary: Remove every stored greeting
 * tags: [greetings]
 * responses:
 *   '200':
 *     description: Count of greetings removed
 *     content:
 *       application/json:
 *         schema:
 *           type: object
 *           properties:
 *             removed: { type: integer }
 */
router.delete('/greetings', async (req, res) => {
  try {
    const greetings = req.collection('greetings', collections.greetings);
    const all = await greetings.find();
    for (const g of all) await greetings.remove(g.id);
    res.json({ removed: all.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * path: /hello/{name}
 * method: get
 * operationId: say_hello
 * summary: Stateless greeting — does not persist anything
 * description: |
 *   Returns a friendly greeting for `name` without writing to the
 *   collection. Useful as a simple example of a custom route that
 *   isn't backed by stored state.
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

export default router;
