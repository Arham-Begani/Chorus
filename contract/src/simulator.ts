/**
 * In-process simulator for the Chorus contract.
 *
 * Runs circuits against a local contract state with no proof server, no chain
 * and no network. The circuit logic exercised here is the SAME compiled logic
 * that gets proven on chain — only the proving and the transaction are skipped.
 * Commitments, nullifiers, the duplicate rejection and the threshold flip are
 * all genuinely computed by the compiled Compact circuits.
 *
 * This started life under `src/test/` because the behavioural tests were its
 * only consumer. It is library code: the local mode of the reporter agent runs
 * on it too, so the UI can be driven end to end on a machine that has no
 * funded wallet. It therefore lives here and is exported as
 * `@chorus/contract/simulator`.
 */

import {
  type CircuitContext,
  QueryContext,
  sampleContractAddress,
  createConstructorContext,
  CostModel,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, type Ledger, ledger } from './managed/chorus/contract/index.js';
import { type ChorusPrivateState, witnesses } from './witnesses.js';

export class ChorusSimulator {
  readonly contract: Contract<ChorusPrivateState>;
  circuitContext: CircuitContext<ChorusPrivateState>;

  constructor(secretKey: Uint8Array) {
    this.contract = new Contract<ChorusPrivateState>(witnesses);
    const { currentPrivateState, currentContractState, currentZswapLocalState } =
      this.contract.initialState(
        createConstructorContext({ secretKey }, '0'.repeat(64)),
      );
    this.circuitContext = {
      currentPrivateState,
      currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(
        currentContractState.data,
        sampleContractAddress(),
      ),
    };
  }

  /**
   * Act as a different reporter against the SAME contract state.
   *
   * This is what makes the threshold testable: three distinct secret keys
   * reporting the same handle are three genuinely unlinkable reporters, not one
   * reporter counted three times.
   */
  public switchReporter(secretKey: Uint8Array): void {
    this.circuitContext.currentPrivateState = { secretKey };
  }

  public getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public getPrivateState(): ChorusPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  /** Call the `report` circuit. Throws if the contract rejects it. */
  public report(handleBytes: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.report(
      this.circuitContext,
      handleBytes,
    ).context;
    return this.getLedger();
  }

  /**
   * Derive a commitment. This is a PURE circuit — no state, no proof, no
   * transaction. It is exactly what the Check screen calls client-side.
   */
  public commitmentOf(handleBytes: Uint8Array): Uint8Array {
    return this.contract.circuits.commitmentOf(this.circuitContext, handleBytes)
      .result;
  }

  /** Derive a nullifier for the CURRENT reporter's secret key. */
  public nullifierOf(handleBytes: Uint8Array): Uint8Array {
    return this.contract.circuits.nullifierOf(
      this.circuitContext,
      handleBytes,
      this.getPrivateState().secretKey,
    ).result;
  }

  /** Count of reports against a commitment, or 0 if it has never been reported. */
  public countOf(commitment: Uint8Array): bigint {
    const l = this.getLedger();
    return l.reportCount.member(commitment)
      ? l.reportCount.lookup(commitment)
      : 0n;
  }

  /** Has this commitment reached the threshold? The one bit Chorus releases. */
  public isMatched(commitment: Uint8Array): boolean {
    return this.getLedger().matched.member(commitment);
  }

  /**
   * Every byte of public ledger state, flattened.
   *
   * Used by the disclosure test to assert that neither a handle nor a secret
   * key appears anywhere an observer could look.
   */
  public publicStateBytes(): Uint8Array[] {
    const l = this.getLedger();
    const out: Uint8Array[] = [];
    for (const [commitment, _count] of l.reportCount) out.push(commitment);
    for (const nullifier of l.seenNullifiers) out.push(nullifier);
    for (const commitment of l.matched) out.push(commitment);
    return out;
  }
}
