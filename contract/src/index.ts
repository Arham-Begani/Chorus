/**
 * Public surface of the Chorus contract package.
 */

import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

export * from './managed/chorus/contract/index.js';
export * from './witnesses.js';
export * from './normalise.js';

export * as ChorusContractModule from './managed/chorus/contract/index.js';

import * as ChorusContract from './managed/chorus/contract/index.js';
import * as Witnesses from './witnesses.js';

/**
 * The deployable handle for the Chorus contract.
 *
 * `withCompiledFileAssets` points at `./managed/chorus`, which is where
 * `compact compile` writes the prover key, verifier key and zkir for the
 * `report` circuit. That path is relative to this package's build output, so
 * the `build` script copies `src/managed` into `dist/managed` verbatim.
 */
export const CompiledChorusContract = CompiledContract.make<
  ChorusContract.Contract<Witnesses.ChorusPrivateState>
>('Chorus', ChorusContract.Contract<Witnesses.ChorusPrivateState>).pipe(
  CompiledContract.withWitnesses(Witnesses.witnesses),
  CompiledContract.withCompiledFileAssets('./managed/chorus'),
);
