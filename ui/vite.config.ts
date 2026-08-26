// Vite config.
//
// `pureCircuits` and `ledger()` come from `@midnight-ntwrk/compact-runtime`,
// which loads a WASM module behind a top-level await. `vite-plugin-wasm` is
// required for the WASM import itself.
//
// The bboard scaffold also uses `vite-plugin-top-level-await`. We deliberately
// do NOT: that plugin `require()`s `rollup` and `esbuild`, neither of which
// Vite 8 ships (it uses rolldown and oxc), so it fails at config load. It only
// ever existed to down-level top-level await for older build targets, and with
// `target: 'esnext'` the browser handles TLA natively.
//
// Using the contract's own WASM circuits is what makes the browser's
// commitment derivation provably identical to the chain's.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  cacheDir: './.vite',
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'esnext',
    minify: false,
  },
  plugins: [react(), wasm()],
  optimizeDeps: {
    include: ['@midnight-ntwrk/compact-runtime'],
    // WASM modules and anything with a top-level await must not be pre-bundled.
    exclude: [
      '@midnight-ntwrk/onchain-runtime-v3',
      '@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm_bg.wasm',
      '@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm.js',
      '@chorus/contract',
      '@chorus/api',
    ],
  },
  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.wasm'],
    mainFields: ['browser', 'module', 'main'],
  },
});
