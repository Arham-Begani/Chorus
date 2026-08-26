// Launcher for the local reporter agent.
//
// Network comes from CHORUS_NETWORK (preview | preprod | standalone) and the
// wallet from CHORUS_WALLET_SEED. Both are environment variables because the
// agent is non-interactive: it has to come up unattended while the UI is
// already open.

import * as path from 'node:path';
import { createLogger } from '../logger-utils.js';
import { runAgent } from '../agent.js';
import { runLocalAgent } from '../local-agent.js';
import { currentDir, PreprodRemoteConfig, PreviewRemoteConfig, StandaloneConfig, type Config } from '../config.js';

const network = process.env.CHORUS_NETWORK ?? 'preview';

// `local` runs the compiled circuits in process — no wallet, no proof server,
// no chain. It exists so the UI can be driven on a machine whose wallet has not
// been through the captcha-gated faucet. It labels itself as simulated.
if (network === 'local') {
  const logDir = path.resolve(currentDir, '..', 'logs', 'local', `${new Date().toISOString()}.log`);
  const logger = await createLogger(logDir);
  await runLocalAgent(logger);
} else {
  const configFor = (name: string): Config => {
    switch (name) {
      case 'preview':
        return new PreviewRemoteConfig();
      case 'preprod':
        return new PreprodRemoteConfig();
      case 'standalone':
        return new StandaloneConfig();
      default:
        throw new Error(`Unknown CHORUS_NETWORK '${name}' (expected local, preview, preprod or standalone)`);
    }
  };

  const config = configFor(network);
  const logger = await createLogger(config.logDir);
  const testEnvironment = config.getEnvironment(logger);
  await runAgent(config, testEnvironment, logger);
}
