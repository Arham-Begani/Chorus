// Where the deployed contract address lives.
//
// Exactly one file per network, written by the CLI at deploy time and read by
// everything else. The UI gets a copy in its `public/` directory so it can
// fetch the address at runtime rather than having it baked in at build time —
// that way redeploying does not require rebuilding the frontend.
//
// Contract address, network id and proof server URL go in one config file, not
// scattered across the codebase.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { currentDir } from './config.js';

export type DeploymentRecord = {
  readonly network: string;
  readonly contractAddress: string;
  readonly deployTxHash: string;
  readonly blockHeight: string;
  readonly threshold: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly deployedAt: string;
};

const repoRoot = path.resolve(currentDir, '..', '..');

export const deploymentPath = (network: string): string =>
  path.resolve(repoRoot, 'deployment', `${network}.json`);

/** The copy the browser fetches at runtime. */
const uiDeploymentPath = path.resolve(repoRoot, 'ui', 'public', 'deployment.json');

export const writeDeployment = async (record: DeploymentRecord): Promise<string> => {
  const target = deploymentPath(record.network);
  const body = `${JSON.stringify(record, null, 2)}\n`;

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body, 'utf8');

  // Best effort: the UI package may not exist yet when the CLI is used alone.
  try {
    await fs.mkdir(path.dirname(uiDeploymentPath), { recursive: true });
    await fs.writeFile(uiDeploymentPath, body, 'utf8');
  } catch {
    // Not fatal — the canonical record is the one under deployment/.
  }

  return target;
};

export const readDeployment = async (network: string): Promise<DeploymentRecord | null> => {
  try {
    const raw = await fs.readFile(deploymentPath(network), 'utf8');
    return JSON.parse(raw) as DeploymentRecord;
  } catch {
    return null;
  }
};
