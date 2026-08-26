/**
 * The read half of Chorus — everything you can do without a wallet.
 *
 * This module is deliberately separate from `index.ts` and deliberately
 * imports nothing that needs a wallet, a proof server, private state or a
 * deployed-contract instance. It is what the browser bundles for Check and for
 * the ledger panel, and keeping it free of the write path is what makes
 * "checking involves no transaction" a structural fact rather than a promise.
 *
 * If an import here ever starts pulling in `midnight-js-contracts` at runtime,
 * something has been wired the wrong way round.
 *
 * @module
 */

import { type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { type PublicDataProvider } from '@midnight-ntwrk/midnight-js-types';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { handleBytes as deriveHandleBytes, ledger, type Ledger, pureCircuits } from '@chorus/contract';
import { type CheckResult, type ChorusLedgerSnapshot, type CommitmentRow } from './common-types.js';

/**
 * Project a raw generated `Ledger` into the plain snapshot every client uses.
 *
 * `reportCount` is iterable in the generated type, which is what lets the raw
 * ledger panel enumerate commitment->count rows without resolving anything.
 * Everything walked here is public, so there is nothing to be careful about.
 */
export const snapshotOf = (ledgerState: Ledger): ChorusLedgerSnapshot => {
  const commitments: CommitmentRow[] = [];
  for (const [commitment, count] of ledgerState.reportCount) {
    commitments.push({
      commitment,
      count,
      matched: ledgerState.matched.member(commitment),
    });
  }
  // Deterministic order, so the ledger panel does not shuffle between polls.
  commitments.sort((a, b) => toHex(a.commitment).localeCompare(toHex(b.commitment)));

  return {
    totalReports: ledgerState.totalReports,
    threshold: ledgerState.threshold,
    nullifierCount: ledgerState.seenNullifiers.size(),
    commitments,
  };
};

/**
 * Read the public ledger of a deployed Chorus register.
 *
 * Takes a bare public data provider rather than the full provider set: this is
 * the read an anonymous bystander can perform, and it should be obvious from
 * the signature that nothing else is required to perform it.
 */
export const readLedger = async (
  publicDataProvider: PublicDataProvider,
  contractAddress: ContractAddress,
): Promise<Ledger | null> => {
  const contractState = await publicDataProvider.queryContractState(contractAddress);
  return contractState != null ? ledger(contractState.data) : null;
};

/** Read the public ledger and project it in one step. */
export const readSnapshot = async (
  publicDataProvider: PublicDataProvider,
  contractAddress: ContractAddress,
): Promise<ChorusLedgerSnapshot> => {
  const ledgerState = await readLedger(publicDataProvider, contractAddress);
  if (ledgerState === null) {
    throw new Error(`No Chorus contract deployed at ${contractAddress}`);
  }
  return snapshotOf(ledgerState);
};

/**
 * Derive a handle's commitment locally.
 *
 * Uses the contract's own pure circuit rather than a reimplementation of the
 * hash, so the client and the chain cannot drift apart. No network, no proof,
 * no key material — this is a hash.
 */
export const commitmentFor = async (handle: string): Promise<Uint8Array> =>
  pureCircuits.commitmentOf(await deriveHandleBytes(handle));

/**
 * Check a handle against the register.
 *
 * The free, traceless half of Chorus: derive the commitment locally, then read
 * the public counter. There is no transaction, no proof and no request to any
 * server that learns what was asked — the ledger read looks identical no
 * matter which handle prompted it.
 */
export const checkHandle = async (
  publicDataProvider: PublicDataProvider,
  contractAddress: ContractAddress,
  handle: string,
): Promise<CheckResult> => {
  const commitment = await commitmentFor(handle);

  const ledgerState = await readLedger(publicDataProvider, contractAddress);
  if (ledgerState === null) {
    throw new Error(`No Chorus contract deployed at ${contractAddress}`);
  }

  const count = ledgerState.reportCount.member(commitment) ? ledgerState.reportCount.lookup(commitment) : 0n;
  const status = count === 0n ? 'unreported' : ledgerState.matched.member(commitment) ? 'matched' : 'below-threshold';

  return { status, count, threshold: ledgerState.threshold, commitment };
};

export * from './common-types.js';
