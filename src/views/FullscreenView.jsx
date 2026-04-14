import { useEffect, useState } from 'react';
import { greetings } from '../data.js';
import {
  appId,
  beeable,
  declareMenu,
  onDataChanged,
  onMenuAction,
  ready,
} from '@beeable/sdk/app-runtime';

// ── Fullscreen mode ────────────────────────────────────────────────
//
// The main app surface. Users land here when they open the app from
// the Beeable launcher. This example demonstrates every piece of the
// Beeable app contract in ~one screen:
//
//   • A form that POSTs to this app's own server route.
//   • A list that GETs from the same route, auto-refreshing via SSE
//     in production (onDataChanged) and manually after mutations.
//   • A menu bar (File → Clear all, Help → About) driven by the
//     SDK's declareMenu/onMenuAction bridge. The host renders the
//     menu in its own top bar — only the host can paint chrome
//     outside the iframe, so menus go through postMessage.
//   • A "Jazz it up" button that calls beeable.llm.chat(...) to
//     rewrite the draft greeting — demonstrates browser-side LLM use.
//   • A "Self-call via SDK" button that uses beeable.app(appId) to
//     hit this app's own /hello/{name} route the way ANOTHER app
//     would. Same pattern you'd use for beeable.app('calendar'), etc.
//
// The runtime knows to show this component at `/apps/{id}/fullscreen`.

export default function FullscreenView() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [jazzing, setJazzing] = useState(false);
  const [pinged, setPinged] = useState(null);
  const [about, setAbout] = useState(false);

  async function load() {
    try {
      setError(null);
      setList(await greetings.list());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Menu bar ────────────────────────────────────────────────────
  //
  // declareMenu sends the shape to the Beeable host; onMenuAction
  // receives `{ action: <id> }` messages when the user clicks. Both
  // are no-ops in the Lovable preview (no parent host to receive
  // the postMessage) — the same code is safe there.
  useEffect(() => {
    ready();
    declareMenu([
      {
        id: 'file',
        label: 'File',
        children: [{ id: 'clear', label: 'Clear all greetings' }],
      },
      {
        id: 'help',
        label: 'Help',
        children: [{ id: 'about', label: 'About' }],
      },
    ]);
    return onMenuAction(async (action) => {
      if (action === 'clear') {
        await greetings.clear();
        await load();
      } else if (action === 'about') {
        setAbout(true);
      }
    });
  }, []);

  useEffect(() => {
    load();
    return onDataChanged(load);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    const created = await greetings.create(name.trim());
    setDraft(created.message);
    setName('');
    await load();
  }

  // ── SDK demo: beeable.llm.chat ─────────────────────────────────
  //
  // Send the current draft to the platform LLM proxy and replace it
  // with the model's playful rewrite. Hits /api/llm/v1/chat/completions
  // (OpenAI-compatible shape). Fails in the Lovable preview because
  // the preview has no platform to proxy through — wrapped in try so
  // the UI surfaces the error instead of crashing.
  async function handleJazzUp() {
    if (!draft || jazzing) return;
    setJazzing(true);
    try {
      const res = await beeable.llm.chat([
        { role: 'system', content: 'Rewrite the user message as one short, playful sentence. No preamble, no quotes.' },
        { role: 'user', content: draft },
      ]);
      // OpenAI-compatible shape — first choice, message content.
      const jazzed = res?.choices?.[0]?.message?.content?.trim();
      if (jazzed) setDraft(jazzed);
    } catch (e) {
      setError(`LLM: ${e.message}`);
    } finally {
      setJazzing(false);
    }
  }

  // ── SDK demo: beeable.app(appId).get(...) ──────────────────────
  //
  // Calls this app's own stateless /hello/{name} route via the proxy,
  // exactly as ANOTHER Beeable app would. `appId` is injected by the
  // runtime and re-exported by the SDK — don't hardcode it.
  async function handleSelfPing() {
    try {
      const who = name.trim() || 'world';
      const res = await beeable.app(appId).get(`/hello/${encodeURIComponent(who)}`);
      setPinged(res?.message ?? null);
    } catch (e) {
      setError(`app(): ${e.message}`);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Hello, world!</h1>
        <p className="text-sm text-slate-500 mt-1">
          A minimal Beeable app: one collection, one API, two views, one menu,
          and the full SDK on display. Fork and start building.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mb-6 flex gap-2 rounded-lg border border-slate-200 bg-white p-3"
      >
        <input
          type="text"
          placeholder="Who should we greet?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Say hello
        </button>
      </form>

      {draft && (
        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Latest draft
          </div>
          <div className="text-slate-900">{draft}</div>
          <button
            onClick={handleJazzUp}
            disabled={jazzing}
            className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {jazzing ? 'Jazzing…' : 'Jazz it up with the LLM'}
          </button>
        </section>
      )}

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Cross-app call (self-ping)
        </div>
        <p className="mb-3 text-sm text-slate-600">
          Uses <code className="rounded bg-slate-100 px-1 text-xs">beeable.app(appId).get('/hello/…')</code>
          {' '}— the same call another app would make to talk to this one.
        </p>
        <button
          onClick={handleSelfPing}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Ping /hello via SDK
        </button>
        {pinged && (
          <div className="mt-3 rounded bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {pinged}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
          {loading ? 'Loading…' : `${list.length} greeting${list.length === 1 ? '' : 's'}`}
        </div>
        {list.length === 0 && !loading ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            No greetings yet — say hello to someone above.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((g) => (
              <li key={g.id} className="px-4 py-3 text-sm text-slate-700">
                <span className="font-medium text-slate-900">{g.message}</span>
                <span className="ml-2 text-xs text-slate-400">
                  {new Date(g.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {about && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setAbout(false)}
        >
          <div
            className="max-w-md rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900">About Hello World</h2>
            <p className="mt-2 text-sm text-slate-600">
              The Beeable starter template. Ships a greetings collection, window
              + fullscreen views, a menu bar, LLM and cross-app SDK calls, and
              a fully-documented OpenAPI surface. Fork it and start building.
            </p>
            <p className="mt-2 text-xs text-slate-400">appId: {appId}</p>
            <button
              onClick={() => setAbout(false)}
              className="mt-4 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
