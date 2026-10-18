import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Next copies local .env files into standalone output independently of tracing.
// Deployment packages must obtain secrets only from runtime configuration.
const directory = resolve('.next/standalone');
if (existsSync(directory)) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if ((name === '.env' || name.startsWith('.env.')) && statSync(path).isFile()) {
      unlinkSync(path);
    }
  }
}
