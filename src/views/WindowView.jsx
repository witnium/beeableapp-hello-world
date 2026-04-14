import { useEffect, useState } from 'react';
import { greetings } from '../data.js';
import { onDataChanged } from '@witnium/beeable-sdk/app-runtime';

// ── Window mode ────────────────────────────────────────────────────
//
// The compact widget the host shows alongside the chat. Keep it
// information-dense and read-only — users dive into fullscreen
// mode for editing. A good window view answers "what's the latest
// state?" at a glance.
//
// In production it auto-refreshes via SSE (onDataChanged). In
// Lovable's preview SSE is a no-op so you'll only see updates after
// a hard refresh — that's expected.

export default function WindowView() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setList(await greetings.list());
    setLoading(false);
  }

  useEffect(() => {
    load();
    return onDataChanged(load);
  }, []);

  const latest = list[0];

  return (
    <div className="p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-slate-800">Hello World</div>
        <div className="text-xs text-slate-500">
          {loading ? '…' : `${list.length} greeting${list.length === 1 ? '' : 's'}`}
        </div>
      </div>

      {!loading && !latest && (
        <div className="text-xs text-slate-400">No greetings yet</div>
      )}

      {latest && (
        <div className="rounded bg-slate-50 px-2 py-1.5">
          <div className="truncate text-slate-800">{latest.message}</div>
          <div className="text-xs text-slate-400">
            {new Date(latest.created_at).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
