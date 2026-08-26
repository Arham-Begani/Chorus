/**
 * The Chorus API — one deployed contract, adapted for every client.
 *
 * The asymmetry between the two actions is the whole product, and it is
 * visible in the shape of this file:
 *
 *   - {@link ChorusAPI.report} needs a wallet, a proof server, a funded
 *     account and a deployed contract instance. It is a transaction.
 *   - {@link checkHandle} is a free function. It needs a public data provider
 *     and nothing else — no wallet, no proof, no private state, no contract
 *     instance. It is a local hash plus a public ledger read.
 *
 * If you ever find yourself needing to move `checkHandle` onto the class,
 * something has gone wrong with the design.
 *
 * @packageDocumentation
 */

import { type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { type Logger } from 'pino';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { map, tap, type Observable } from 'rxjs';
import { assertIsContractAddress, toHex } from '@midnight-ntwrk/midnight-js-utils';
import {
  CompiledChorusContract,
  type ChorusPrivateState,
  createChorusPrivateState,
  freshSecretKey,
  handleBytes as deriveHandleBytes,
  ledger,
  type Ledger,
  pureCircuits,
} from '@chorus/contract';
import {
  type ChorusDerivedState,
  type ChorusContract,
  type ChorusLedgerSnapshot,
  type ChorusProviders,
  chorusPrivateStateKey,
  type DeployedChorusContract,
  type ReportReceipt,
} from './common-types.js';
import { readLedger, snapshotOf } from './read.js';

/**
 * Read the current public ledger state of a deployed Chorus contract.
 *
 * A thin wrapper over {@link readLedger} that additionally validates the
 * address, for callers that already hold a full provider set.
 */
export const getChorusLedgerState = async (
  providers: ChorusProviders,
  contractAddress: ContractAddress,
): Promise<Ledger | null> => {
  assertIsContractAddress(contractAddress);
  return readLedger(providers.publicDataProvider, contractAddress);
};

/**
 * A Chorus contract that has been deployed or joined, bound to one reporter's
 * private state.
 */
export class ChorusAPI {
  private constructor(
    public readonly deployedContract: DeployedChorusContract,
    private readonly providers: ChorusProviders,
    private readonly logger?: Logger,
  ) {
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(this.deployedContractAddress);

    this.state$ = providers.publicDataProvider
      .contractStateObservable(this.deployedContractAddress, { type: 'latest' })
      .pipe(
        map((contractState) => ({ snapshot: snapshotOf(ledger(contractState.data)) })),
        tap((derived) =>
          logger?.trace({
            ledgerStateChanged: {
              totalReports: derived.snapshot.totalReports,
              nullifierCount: derived.snapshot.nullifierCount,
              commitments: derived.snapshot.commitments.length,
            },
          }),
        ),
      );
  }

  readonly deployedContractAddress: ContractAddress;

  /** Public ledger state, as it changes. */
  readonly state$: Observable<ChorusDerivedState>;

  /**
   * Report a handle.
   *
   * The raw handle is normalised and hashed here; only the 32 bytes go into
   * the circuit, and only the commitment and nullifier come out of it. The
   * call fails at the contract — not in client-side validation — if this
   * reporter has already reported this handle, because the nullifier is
   * already in the public set.
   */
  async report(handle: string): Promise<ReportReceipt> {
    const bytes = await deriveHandleBytes(handle);

    // Derived here purely so the caller can display them; the circuit derives
    // them again itself and the chain only trusts its own derivation.
    const commitment = pureCircuits.commitmentOf(bytes);
    const privateState = await this.currentPrivateState();
    const nullifier = pureCircuits.nullifierOf(bytes, privateState.secretKey);

    this.logger?.info({ reporting: { commitment: toHex(commitment), nullifier: toHex(nullifier) } });

    const txData = await this.deployedContract.callTx.report(bytes);

    this.logger?.trace({
      transactionAdded: {
        circuit: 'report',
        txHash: txData.public.txHash,
        blockHeight: txData.public.blockHeight,
      },
    });

    const ledgerState = await getChorusLedgerState(this.providers, this.deployedContractAddress);
    const count = ledgerState?.reportCount.member(commitment) ? ledgerState.reportCount.lookup(commitment) : 0n;

    return {
      txHash: txData.public.txHash,
      blockHeight: txData.public.blockHeight,
      commitment,
      nullifier,
      count,
      matched: ledgerState?.matched.member(commitment) ?? false,
    };
  }

  /**
   * Derive this reporter's commitment and nullifier for a handle without
   * submitting anything.
   *
   * The UI shows both, as hex, before the submit button is pressed. A user
   * watching the handle they typed turn into two opaque hashes *before* it
   * leaves the browser is a large part of the pitch, and it costs one local
   * hash to show.
   */
  async derive(handle: string): Promise<{ commitment: Uint8Array; nullifier: Uint8Array }> {
    const bytes = await deriveHandleBytes(handle);
    const privateState = await this.currentPrivateState();
    return {
      commitment: pureCircuits.commitmentOf(bytes),
      nullifier: pureCircuits.nullifierOf(bytes, privateState.secretKey),
    };
  }

  /** Read current public state once, without subscribing. */
  async snapshot(): Promise<ChorusLedgerSnapshot> {
    const ledgerState = await getChorusLedgerState(this.providers, this.deployedContractAddress);
    if (ledgerState === null) {
      throw new Error(`No Chorus contract deployed at ${this.deployedContractAddress}`);
    }
    return snapshotOf(ledgerState);
  }

  private async currentPrivateState(): Promise<ChorusPrivateState> {
    const privateState = await this.providers.privateStateProvider.get(chorusPrivateStateKey);
    if (privateState === null) {
      throw new Error('No Chorus private state — the reporter secret key is missing');
    }
    return privateState;
  }

  /**
   * Deploy a fresh Chorus contract.
   *
   * The constructor seals `threshold` at 3. Nobody, including whoever runs
   * this, can change it afterwards.
   */
  static async deploy(providers: ChorusProviders, logger?: Logger, secretKey?: Uint8Array): Promise<ChorusAPI> {
    logger?.info('deployContract');

    const deployed = await deployContract(providers, {
      compiledContract: CompiledChorusContract,
      privateStateId: chorusPrivateStateKey,
      initialPrivateState: createChorusPrivateState(secretKey ?? freshSecretKey()),
    });

    logger?.info({
      contractDeployed: {
        contractAddress: deployed.deployTxData.public.contractAddress,
        txHash: deployed.deployTxData.public.txHash,
        blockHeight: deployed.deployTxData.public.blockHeight,
      },
    });

    return new ChorusAPI(deployed, providers, logger);
  }

  /** Join a Chorus contract that is already on chain. */
  static async join(
    providers: ChorusProviders,
    contractAddress: ContractAddress,
    logger?: Logger,
    secretKey?: Uint8Array,
  ): Promise<ChorusAPI> {
    logger?.info({ joinContract: { contractAddress } });

    const deployed = await findDeployedContract<ChorusContract>(providers, {
      contractAddress,
      compiledContract: CompiledChorusContract,
      privateStateId: chorusPrivateStateKey,
      initialPrivateState: await ChorusAPI.resolvePrivateState(providers, contractAddress, secretKey),
    });

    logger?.trace({ contractJoined: { contractAddress } });

    return new ChorusAPI(deployed, providers, logger);
  }

  /**
   * Use the stored secret key if this store already has one, otherwise adopt
   * the supplied key, otherwise mint a fresh one.
   *
   * Reusing a stored key is what makes the nullifier-rejection demo real: the
   * second report from the same store derives the same nullifier and the
   * contract refuses it.
   */
  private static async resolvePrivateState(
    providers: ChorusProviders,
    contractAddress: ContractAddress,
    secretKey?: Uint8Array,
  ): Promise<ChorusPrivateState> {
    providers.privateStateProvider.setContractAddress(contractAddress);
    const existing = await providers.privateStateProvider.get(chorusPrivateStateKey);
    return existing ?? createChorusPrivateState(secretKey ?? freshSecretKey());
  }
}

export * as utils from './utils/index.js';
export { randomBytes, truncateHex } from './utils/index.js';
export * from './read.js';
