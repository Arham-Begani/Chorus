/**
 * Chorus common types.
 *
 * These are the shapes shared by every client of the deployed contract — the
 * CLI, the local reporter agent, and the browser UI. Keeping them in one place
 * is what stops the three from drifting apart in how they read the ledger.
 *
 * @module
 */

import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { Contract, Witnesses, ChorusPrivateState } from '@chorus/contract';

export const chorusPrivateStateKey = 'chorusPrivateState';
export type PrivateStateId = typeof chorusPrivateStateKey;

/**
 * The private-state schema for the application.
 *
 * Chorus has exactly one contract type and therefore exactly one key. Note
 * that isolation between the three demo reporters is NOT achieved here — it is
 * achieved by giving each reporter its own private state *provider* (its own
 * store name). Two reporters sharing a store would share a secret key, which
 * would collapse their nullifiers into one and make the threshold demo a lie.
 */
export type PrivateStates = {
  readonly chorusPrivateState: ChorusPrivateState;
};

export type ChorusContract = Contract<ChorusPrivateState, Witnesses<ChorusPrivateState>>;

/** The keys of the circuits that write — `report` is the only one. */
export type ChorusCircuitKeys = Exclude<keyof ChorusContract['impureCircuits'], number | symbol>;

export type ChorusProviders = MidnightProviders<ChorusCircuitKeys, PrivateStateId, ChorusPrivateState>;

export type DeployedChorusContract = FoundContract<ChorusContract>;

/**
 * One row of the public ledger: an opaque 32-byte commitment, how many
 * distinct reporters have reported it, and whether it has reached the
 * threshold.
 *
 * This is the entire readable content of the register. There is deliberately
 * no field here that could be resolved back to a handle.
 */
export type CommitmentRow = {
  readonly commitment: Uint8Array;
  readonly count: bigint;
  readonly matched: boolean;
};

/**
 * A full snapshot of public ledger state.
 *
 * Everything in here is world-readable and permanently public. An observer
 * with a full copy of the chain sees exactly this and nothing more.
 */
export type ChorusLedgerSnapshot = {
  readonly totalReports: bigint;
  readonly threshold: bigint;
  readonly nullifierCount: bigint;
  readonly commitments: readonly CommitmentRow[];
};

/**
 * The outcome of a Check.
 *
 * `unreported` and `below-threshold` are deliberately distinct: below the
 * threshold, a non-zero count is information the register holds but does not
 * assert anything with. Only `matched` releases the one bit Chorus exists to
 * release.
 */
export type CheckStatus = 'unreported' | 'below-threshold' | 'matched';

export type CheckResult = {
  readonly status: CheckStatus;
  readonly count: bigint;
  readonly threshold: bigint;
  /** The locally derived commitment, so the UI can show what it looked up. */
  readonly commitment: Uint8Array;
};

/**
 * Public ledger state combined with this reporter's private state.
 *
 * `hasReported` is derived by testing this reporter's own nullifier for
 * membership of the public nullifier set. That test is only possible for
 * someone holding the secret key — an observer sees the same set and learns
 * nothing from it.
 */
export type ChorusDerivedState = {
  readonly snapshot: ChorusLedgerSnapshot;
};

/** The result of a successful `report` transaction. */
export type ReportReceipt = {
  readonly txHash: string;
  /** A `number`, not a `bigint` — this is what `FinalizedTxData` reports. */
  readonly blockHeight: number;
  readonly commitment: Uint8Array;
  readonly nullifier: Uint8Array;
  readonly count: bigint;
  readonly matched: boolean;
};
