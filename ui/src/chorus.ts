/**
 * The browser's view of the register.
 *
 * Two readers, one interface:
 *
 *   ChorusReader  — talks to the public indexer directly. This is the real
 *                   thing, and it is why "checking involves no transaction and
 *                   no server request" is literally true: the only import from
 *                   the api package is `@chorus/api/read`, the half that has no
 *                   wallet and cannot write.
 *
 *   LocalReader   — talks to the local agent running the compiled circuits in
 *                   process. Used when there is no funded wallet. It reports
 *                   itself as `simulated` so the UI can say so on screen.
 *
 * Both return plain strings rather than byte arrays, because everything the UI
 * does with these values is render them as hex.
 */

import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { checkHandle, readSnapshot } from '@chorus/api/read';
import { normaliseHandle } from '@chorus/contract';
import { AGENT_URL, type Deployment } from './config.js';

export { normaliseHandle };

export type CheckStatus = 'unreported' | 'below-threshold' | 'matched';

export type UiCommitment = {
  readonly commitment: string;
  readonly count: string;
  readonly matched: boolean;
};

export type UiSnapshot = {
  readonly totalReports: string;
  readonly threshold: string;
  readonly nullifierCount: string;
  readonly commitments: readonly UiCommitment[];
};

export type UiCheck = {
  readonly status: CheckStatus;
  readonly count: string;
  readonly threshold: string;
  readonly commitment: string;
};

export type Reader = {
  readonly simulated: boolean;
  snapshot(): Promise<UiSnapshot>;
  check(handle: string): Promise<UiCheck>;
};

/** Hex, lowercase, no 0x prefix — matching how the CLI prints commitments. */
export const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const truncate = (value: string, lead = 10, tail = 8): string =>
  value.length <= lead + tail ? value : `${value.slice(0, lead)}…${value.slice(-tail)}`;

/** Reads the real chain through the public indexer. No wallet involved. */
export class ChorusReader implements Reader {
  readonly simulated = false;
  private readonly provider: ReturnType<typeof indexerPublicDataProvider>;

  constructor(private readonly deployment: Deployment) {
    // The network id is global state in the SDK and must be set before any
    // address is parsed, or contract addresses decode against the wrong network
    // and every read silently returns nothing.
    setNetworkId(deployment.network as Parameters<typeof setNetworkId>[0]);
    this.provider = indexerPublicDataProvider(deployment.indexer, deployment.indexerWS);
  }

  async snapshot(): Promise<UiSnapshot> {
    const snap = await readSnapshot(this.provider, this.deployment.contractAddress);
    return {
      totalReports: String(snap.totalReports),
      threshold: String(snap.threshold),
      nullifierCount: String(snap.nullifierCount),
      commitments: snap.commitments.map((row) => ({
        commitment: hex(row.commitment),
        count: String(row.count),
        matched: row.matched,
      })),
    };
  }

  /**
   * Check one handle.
   *
   * Note what is absent: no reporter identity, no key, no submission, and no
   * record anywhere that the question was asked.
   */
  async check(handle: string): Promise<UiCheck> {
    const result = await checkHandle(this.provider, this.deployment.contractAddress, handle);
    return {
      status: result.status,
      count: String(result.count),
      threshold: String(result.threshold),
      commitment: hex(result.commitment),
    };
  }
}

/**
 * Reads the in-process simulator through the local agent.
 *
 * Same circuits, same derivations, same threshold logic — no chain. Only used
 * when the deployment record says `local`.
 */
export class LocalReader implements Reader {
  readonly simulated = true;

  async snapshot(): Promise<UiSnapshot> {
    const response = await fetch(`${AGENT_URL}/api/ledger`);
    if (!response.ok) {
      throw new Error('Local agent not reachable');
    }
    return (await response.json()) as UiSnapshot;
  }

  async check(handle: string): Promise<UiCheck> {
    const response = await fetch(`${AGENT_URL}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle }),
    });
    if (!response.ok) {
      throw new Error('Local agent not reachable');
    }
    return (await response.json()) as UiCheck;
  }
}

export const readerFor = (deployment: Deployment): Reader =>
  deployment.network === 'local' ? new LocalReader() : new ChorusReader(deployment);
