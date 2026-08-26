/**
 * The private state of a Chorus reporter, and the single witness that reads it.
 *
 * The secret key never leaves this object. Its only observable effect anywhere
 * in the system is the nullifier derived from it inside the `report` circuit —
 * and a nullifier is a 32-byte hash that cannot be linked back to the key, to
 * the reporter, or to any other nullifier the same reporter produced for a
 * different handle.
 */

import { Ledger } from './managed/chorus/contract/index.js';
import { WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

/**
 * A reporter's private state. One secret key, held locally.
 *
 * For the demo three distinct keys are selectable so a single browser can act
 * as three genuinely unlinkable reporters. They must be independently random —
 * deriving them from a counter would make them linkable and would make the
 * threshold demonstration a lie.
 */
export type ChorusPrivateState = {
  readonly secretKey: Uint8Array;
};

export const createChorusPrivateState = (
  secretKey: Uint8Array,
): ChorusPrivateState => ({ secretKey });

/**
 * Generate a fresh, independently random 32-byte reporter secret.
 *
 * Uses the platform CSPRNG. Never derive these from a seed, an index, or a
 * counter: two reporters whose keys are related produce nullifiers that an
 * observer could potentially correlate, which would undermine the central
 * privacy claim.
 */
export const freshSecretKey = (): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(32));

/**
 * The witnesses object: one field per witness function declared in Compact.
 *
 * `localSecretKey` needs neither the ledger nor the contract address, so it
 * destructures only `privateState` from the WitnessContext. It returns a tuple
 * of (possibly updated) private state and the declared return value — here the
 * key is read, never modified, so the state passes straight through.
 */
export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, ChorusPrivateState>): [
    ChorusPrivateState,
    Uint8Array,
  ] => [privateState, privateState.secretKey],
};
