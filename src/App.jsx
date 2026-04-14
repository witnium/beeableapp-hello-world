import WindowView from './views/WindowView.jsx';
import FullscreenView from './views/FullscreenView.jsx';

// ── View mode detection ────────────────────────────────────────────
//
// The Beeable runtime serves this app at two URLs:
//   /apps/{id}/window      → small dock widget shown alongside chat
//   /apps/{id}/fullscreen  → full app surface
//
// Both URLs serve the SAME index.html (Vite SPA fallback). We pick
// the right view by inspecting window.location.pathname. In Lovable's
// preview the path is just `/` — we default to fullscreen there so
// you see the main UI while iterating.
//
// IMPORTANT: keep BOTH views working. Window mode is what users see
// most of the time (the persistent widget), fullscreen is what they
// open when they want to do real work. They are NOT optional.

function detectMode() {
  if (typeof window === 'undefined') return 'fullscreen';
  const path = window.location.pathname;
  if (path.endsWith('/window') || path.endsWith('/window/')) return 'window';
  return 'fullscreen';
}

export default function App() {
  const mode = detectMode();
  return mode === 'window' ? <WindowView /> : <FullscreenView />;
}
