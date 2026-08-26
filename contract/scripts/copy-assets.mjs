/**
 * Copy the compiler's output into `dist` after `tsc` runs.
 *
 * `src/managed/chorus` holds the prover key, verifier key and zkir that
 * `compact compile` produced. TypeScript does not know about them, so they
 * have to be copied verbatim — and they must keep their directory structure,
 * because `withCompiledFileAssets('./managed/chorus')` resolves against it.
 *
 * This is a script rather than a shell one-liner so it behaves identically on
 * Windows, macOS and Linux: `cp -Rf` is not available in cmd.exe, and the copy
 * tools that are cross-platform disagree with each other about whether a glob
 * preserves parent directories.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const copies = [
  ['src/managed', 'dist/managed'],
  ['src/chorus.compact', 'dist/chorus.compact'],
];

for (const [from, to] of copies) {
  const source = path.join(packageRoot, from);
  const target = path.join(packageRoot, to);

  if (!fs.existsSync(source)) {
    console.error(`missing ${from} — run 'npm run compact' first`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  console.log(`copied ${from} -> ${to}`);
}
