// ── Greetings client ──────────────────────────────────────────────
//
// Thin wrappers around this app's own /greetings endpoints. The HTTP
// surface is defined in server/routes.js with @openapi blocks — the
// same surface external callers (Buzz, other apps) see — and these
// helpers just talk to it.
//
// __BEEABLE_BASE__ is injected by the runtime and resolves to either
// the proxy path (/api/apps/{name}/proxy) or the direct app path
// (/apps/{id}). Append /api to reach the app's express handlers.

const BASE = `${window.__BEEABLE_BASE__ ?? ''}/api`;

async function request(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* not JSON */ }
    throw new Error(`${init?.method ?? 'GET'} ${path} ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const greetings = {
  list: () => request('/greetings'),
  create: (name) => request('/greetings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }),
  clear: () => request('/greetings', { method: 'DELETE' }),
  // Stateless helper — returns a greeting without persisting. Handy for
  // showing how a custom route that isn't backed by a collection looks.
  hello: (name) => request(`/hello/${encodeURIComponent(name)}`),
};
