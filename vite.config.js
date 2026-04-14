import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Beeable runtime overrides `base` at request time (it serves apps under
// `/apps/{id}/`). When this app runs inside Lovable's preview, base is `/`.
// Don't set `base` here — let both environments do the right thing.
export default defineConfig({
  plugins: [react()],
});
