/**
 * Client for the local reporter agent.
 *
 * This is the ONLY part of the UI that talks to anything other than the public
 * indexer, and it is only used by Report. The agent runs on localhost and
 * plays the role Lace would play in production: it holds the wallet, reaches
 * the proof server, and submits the transaction.
 */

import { AGENT_URL } from './config.js';

export type ReporterId = 'A' | 'B' | 'C';
export const REPORTERS: ReporterId[] = ['A', 'B', 'C'];

export type AgentStatus = {
  readonly ready: boolean;
  readonly network: string;
  readonly contractAddress: string;
  /** True when the agent is running circuits in process rather than on chain. */
  readonly simulated?: boolean;
};

export type Derived = {
  readonly normalised: string;
  readonly commitment: string;
  readonly nullifier: string;
};

export type Receipt = {
  readonly txHash: string;
  readonly blockHeight: string;
  readonly commitment: string;
  readonly nullifier: string;
  readonly count: string;
  readonly matched: boolean;
};

/** A report the contract refused. Not an error in the system — the system working. */
export class DuplicateReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateReportError';
  }
}

const post = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await fetch(`${AGENT_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (response.status === 409) {
    const payload = (await response.json()) as { error: string };
    throw new DuplicateReportError(payload.error);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({ error: response.statusText }))) as { error: string };
    throw new Error(payload.error);
  }
  return (await response.json()) as T;
};

export const agentStatus = async (): Promise<AgentStatus> => {
  const response = await fetch(`${AGENT_URL}/api/status`);
  if (!response.ok) {
    throw new Error(`Reporter agent not reachable at ${AGENT_URL}`);
  }
  return (await response.json()) as AgentStatus;
};

/**
 * Ask the agent what this reporter's commitment and nullifier would be.
 *
 * Shown before the submit button is pressed, so the user watches the handle
 * they typed become two opaque hashes before anything is sent anywhere.
 */
export const derive = async (reporter: ReporterId, handle: string): Promise<Derived> =>
  post<Derived>('/api/derive', { reporter, handle });

/** Submit a real report: real proof, real transaction, real ledger write. */
export const report = async (reporter: ReporterId, handle: string): Promise<Receipt> =>
  post<Receipt>('/api/report', { reporter, handle });
