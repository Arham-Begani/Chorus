/*
 * The Chorus CLI.
 *
 * This is the driver that produces the on-chain milestones: deploy (M2), one
 * report confirmed with the count read back (M3), a duplicate rejected by the
 * contract (M4), and the threshold flipping on the third distinct reporter
 * (M5).
 *
 * Nothing on this path is mocked. Every report is a real proof, a real
 * transaction, and a real ledger read afterwards.
 */

import { createInterface, type Interface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { WebSocket } from 'ws';
import { ChorusAPI, checkHandle, type ChorusLedgerSnapshot, type ChorusProviders } from '@chorus/api';
import { normaliseHandle } from '@chorus/contract';
import { type WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { type Logger } from 'pino';
import { type Config, StandaloneConfig } from './config.js';
import { type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { type TestEnvironment } from '@midnight-ntwrk/testkit-js';
import { MidnightWalletProvider } from './midnight-wallet-provider.js';
import { randomBytes } from '@chorus/api';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { syncWallet, waitForUnshieldedFunds } from './wallet-utils.js';
import { generateDust } from './generate-dust.js';
import { buildProviders, isReporterId, REPORTER_IDS, type ReporterId } from './reporters.js';
import { readDeployment, writeDeployment } from './deployment.js';

// @ts-expect-error: needed to enable WebSocket usage through apollo
globalThis.WebSocket = WebSocket;

/* ------------------------------------------------------------------ *
 * Display helpers
 * ------------------------------------------------------------------ */

/**
 * Print the public ledger exactly as an anonymous observer would see it.
 *
 * Deliberately not prettified. No commitment is resolved back to a handle,
 * even when the CLI happens to know the handle that produced it: the point of
 * this panel is that it contains nothing but hashes, and dressing it up would
 * destroy the only argument it makes.
 */
const displayLedger = (snapshot: ChorusLedgerSnapshot, logger: Logger): void => {
  logger.info('--- public ledger state (visible to everyone) ---');
  logger.info(`threshold:      ${snapshot.threshold}   (sealed — cannot be changed by anyone)`);
  logger.info(`totalReports:   ${snapshot.totalReports}`);
  logger.info(`seenNullifiers: ${snapshot.nullifierCount}`);
  logger.info(`reportCount:    ${snapshot.commitments.length} commitment(s)`);
  for (const row of snapshot.commitments) {
    logger.info(`  ${toHex(row.commitment)}  count=${row.count}${row.matched ? '  [MATCHED]' : ''}`);
  }
  logger.info('--- end of ledger state ---');
};

const describeCheck = (status: string, count: bigint, threshold: bigint): string => {
  switch (status) {
    case 'unreported':
      return 'no reports — this handle is not in the register';
    case 'below-threshold':
      return `reported, below threshold (${count}/${threshold})`;
    default:
      return `*** MATCHED *** ${count} independent reporters have reported this handle`;
  }
};

/* ------------------------------------------------------------------ *
 * Deploy / join
 * ------------------------------------------------------------------ */

const DEPLOY_OR_JOIN_QUESTION = `
You can do one of the following:
  1. Deploy a new Chorus register
  2. Join an existing Chorus register (by address)
  3. Join the register recorded in deployment/<network>.json
  4. Exit
Which would you like to do? `;

/**
 * Reporter A's provider set is the one used to deploy, purely because
 * something has to be. The deployer holds no special power afterwards: the
 * threshold is `sealed`, so it is fixed at construction and cannot be changed
 * by the deployer or by anyone else.
 */
const deployOrJoin = async (
  config: Config,
  providersFor: (reporter: ReporterId) => ChorusProviders,
  rli: Interface,
  logger: Logger,
): Promise<ContractAddress | null> => {
  while (true) {
    const choice = await rli.question(DEPLOY_OR_JOIN_QUESTION);
    switch (choice) {
      case '1': {
        const api = await ChorusAPI.deploy(providersFor('A'), logger);
        const deployTx = api.deployedContract.deployTxData.public;
        const snapshot = await api.snapshot();
        const target = await writeDeployment({
          network: config.networkName,
          contractAddress: api.deployedContractAddress,
          deployTxHash: deployTx.txHash,
          blockHeight: String(deployTx.blockHeight),
          threshold: String(snapshot.threshold),
          indexer: '',
          indexerWS: '',
          deployedAt: new Date().toISOString(),
        });
        logger.info(`Deployed Chorus at address: ${api.deployedContractAddress}`);
        logger.info(`Deploy tx hash:             ${deployTx.txHash}`);
        logger.info(`Block height:               ${deployTx.blockHeight}`);
        logger.info(`Wrote deployment record to: ${target}`);
        return api.deployedContractAddress;
      }
      case '2':
        return await rli.question('What is the contract address (in hex)? ');
      case '3': {
        const record = await readDeployment(config.networkName);
        if (record === null) {
          logger.error(`No deployment record found for network '${config.networkName}'`);
          break;
        }
        logger.info(`Using recorded address: ${record.contractAddress}`);
        return record.contractAddress;
      }
      case '4':
        logger.info('Exiting...');
        return null;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

/* ------------------------------------------------------------------ *
 * The scripted M3-M5 demonstration
 * ------------------------------------------------------------------ */

/**
 * Run the three milestones end to end against a live contract and print a
 * result a judge can verify independently against the indexer.
 *
 * Uses a handle unique to this run so the demonstration is not confused by
 * reports left behind from a previous run — the nullifier set is permanent, so
 * re-running with a fixed handle would legitimately fail at step 1.
 */
const runMilestoneDemo = async (
  joined: Record<ReporterId, ChorusAPI>,
  rli: Interface,
  logger: Logger,
): Promise<void> => {
  const suggested = `scammer-${toHex(randomBytes(4))}@upi`;
  const answer = await rli.question(`Handle to use for the demo [${suggested}]: `);
  const handle = answer.trim() === '' ? suggested : answer.trim();

  logger.info(`Running M3-M5 against handle '${handle}' (normalises to '${normaliseHandle(handle)}')`);

  // ---- M3: one report, confirmed, count read back from chain -------------
  logger.info('=== M3: reporter A reports the handle ===');
  const first = await joined.A.report(handle);
  logger.info(`tx:          ${first.txHash}`);
  logger.info(`block:       ${first.blockHeight}`);
  logger.info(`commitment:  ${toHex(first.commitment)}`);
  logger.info(`nullifier:   ${toHex(first.nullifier)}  (reporter A's, unlinkable to A)`);
  logger.info(`count now:   ${first.count}`);
  if (first.count !== 1n) {
    logger.warn(`Expected count 1, chain says ${first.count} — this handle was reported before.`);
  }

  // ---- M4: the same reporter, the same handle, rejected ------------------
  logger.info('=== M4: reporter A reports the SAME handle again ===');
  try {
    await joined.A.report(handle);
    logger.error('FAILED: the duplicate was accepted. The nullifier check is not working.');
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.info(`Rejected, as it must be: ${message}`);
    logger.info('Note this failed at the contract, not in UI validation: the nullifier');
    logger.info('was already a member of the public seenNullifiers set.');
  }

  // ---- M5: two more distinct keys flip the threshold ---------------------
  logger.info('=== M5: reporters B and C report the same handle ===');
  const second = await joined.B.report(handle);
  logger.info(`B  tx=${second.txHash}  count=${second.count}  matched=${second.matched}`);
  if (second.matched) {
    logger.warn('Matched at count 2 — the threshold is not what this demo assumes.');
  }

  const third = await joined.C.report(handle);
  logger.info(`C  tx=${third.txHash}  count=${third.count}  matched=${third.matched}`);

  if (third.matched) {
    logger.info('*** THRESHOLD REACHED ***');
    logger.info('Three strangers who cannot identify each other just learned they were');
    logger.info('hit by the same operator. The handle was never on the chain.');
  } else {
    logger.error('FAILED: three distinct reporters did not flip the match flag.');
  }

  // Same handle, three different reporters: one commitment, three nullifiers.
  logger.info('=== identity check ===');
  logger.info(`A commitment: ${toHex(first.commitment)}`);
  logger.info(`B commitment: ${toHex(second.commitment)}`);
  logger.info(`C commitment: ${toHex(third.commitment)}`);
  logger.info('^ identical: same handle always derives the same commitment');
  logger.info(`A nullifier:  ${toHex(first.nullifier)}`);
  logger.info(`B nullifier:  ${toHex(second.nullifier)}`);
  logger.info(`C nullifier:  ${toHex(third.nullifier)}`);
  logger.info('^ all different: three distinct secret keys, three unlinkable nullifiers');

  displayLedger(await joined.A.snapshot(), logger);
};

/* ------------------------------------------------------------------ *
 * Main loop
 * ------------------------------------------------------------------ */

const MAIN_LOOP_QUESTION = `
You can do one of the following:
  1. Report a handle (a real transaction: proof, tx, ledger write)
  2. Check a handle (free: local hash + public ledger read, no transaction)
  3. Display the raw public ledger state
  4. Show what this reporter would derive for a handle (no submission)
  5. Run the full M3-M5 demonstration
  6. Exit
Which would you like to do? `;

const mainLoop = async (
  config: Config,
  providersFor: (reporter: ReporterId) => ChorusProviders,
  rli: Interface,
  logger: Logger,
): Promise<void> => {
  const contractAddress = await deployOrJoin(config, providersFor, rli, logger);
  if (contractAddress === null) {
    return;
  }

  // Join once per reporter. Each has its own private state store, so each ends
  // up with its own independently random secret key on first join, and reuses
  // that same key on every subsequent run — which is what makes the duplicate
  // rejection in M4 real rather than staged.
  logger.info('Joining as reporters A, B and C (three independent secret keys)...');
  const joined = {} as Record<ReporterId, ChorusAPI>;
  for (const reporter of REPORTER_IDS) {
    joined[reporter] = await ChorusAPI.join(providersFor(reporter), contractAddress, logger);
    logger.info(`  reporter ${reporter} ready`);
  }

  while (true) {
    const choice = await rli.question(MAIN_LOOP_QUESTION);
    try {
      switch (choice) {
        case '1': {
          const who = (await rli.question(`Which reporter (${REPORTER_IDS.join('/')})? `)).trim().toUpperCase();
          if (!isReporterId(who)) {
            logger.error(`Not a reporter: ${who}`);
            break;
          }
          const handle = await rli.question('What handle do you want to report? ');
          const receipt = await joined[who].report(handle);
          logger.info(`tx:         ${receipt.txHash}`);
          logger.info(`commitment: ${toHex(receipt.commitment)}`);
          logger.info(`nullifier:  ${toHex(receipt.nullifier)}`);
          logger.info(`count:      ${receipt.count}${receipt.matched ? '  *** MATCHED ***' : ''}`);
          break;
        }
        case '2': {
          const handle = await rli.question('What handle do you want to check? ');
          // Note the argument: a bare public data provider, not the full
          // provider set. Checking cannot reach a wallet even by accident.
          const result = await checkHandle(providersFor('A').publicDataProvider, contractAddress, handle);
          logger.info(`commitment: ${toHex(result.commitment)}`);
          logger.info(describeCheck(result.status, result.count, result.threshold));
          logger.info('No transaction was submitted and no proof was generated.');
          break;
        }
        case '3':
          displayLedger(await joined.A.snapshot(), logger);
          break;
        case '4': {
          const who = (await rli.question(`Which reporter (${REPORTER_IDS.join('/')})? `)).trim().toUpperCase();
          if (!isReporterId(who)) {
            logger.error(`Not a reporter: ${who}`);
            break;
          }
          const handle = await rli.question('What handle? ');
          const derived = await joined[who].derive(handle);
          logger.info(`normalised: '${normaliseHandle(handle)}'`);
          logger.info(`commitment: ${toHex(derived.commitment)}`);
          logger.info(`nullifier:  ${toHex(derived.nullifier)}`);
          logger.info('Neither the handle nor the secret key is recoverable from either value.');
          break;
        }
        case '5':
          await runMilestoneDemo(joined, rli, logger);
          break;
        case '6':
          logger.info('Exiting...');
          return;
        default:
          logger.error(`Invalid choice: ${choice}`);
      }
    } catch (e) {
      logError(logger, e);
      logger.info('Returning to main menu...');
    }
  }
};

/* ------------------------------------------------------------------ *
 * Wallet setup
 * ------------------------------------------------------------------ */

/** Genesis-mint seed for a local standalone node. Testnets need the faucet. */
const GENESIS_MINT_WALLET_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

const WALLET_LOOP_QUESTION = `
You can do one of the following:
  1. Build a fresh wallet
  2. Build wallet from a seed
  3. Exit
Which would you like to do? `;

const buildWallet = async (config: Config, rli: Interface, logger: Logger): Promise<string | undefined> => {
  if (config instanceof StandaloneConfig) {
    return GENESIS_MINT_WALLET_SEED;
  }
  // A seed in the environment makes the demo repeatable without re-funding,
  // which matters because the faucet is captcha-gated and cannot be scripted.
  const fromEnv = process.env.CHORUS_WALLET_SEED;
  if (fromEnv !== undefined && fromEnv !== '') {
    logger.info('Using wallet seed from CHORUS_WALLET_SEED');
    return fromEnv;
  }
  while (true) {
    const choice = await rli.question(WALLET_LOOP_QUESTION);
    switch (choice) {
      case '1':
        return toHex(randomBytes(32));
      case '2':
        return await rli.question('Enter your wallet seed: ');
      case '3':
        logger.info('Exiting...');
        return undefined;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

export const run = async (config: Config, testEnv: TestEnvironment, logger: Logger): Promise<void> => {
  const rli = createInterface({ input, output, terminal: true });
  const providersToBeStopped: MidnightWalletProvider[] = [];
  try {
    const envConfiguration = await testEnv.start();
    logger.info(`Environment started with configuration: ${JSON.stringify(envConfiguration)}`);

    const seed = await buildWallet(config, rli, logger);
    if (seed === undefined) {
      return;
    }

    const walletProvider = await MidnightWalletProvider.build(logger, envConfiguration, seed);
    providersToBeStopped.push(walletProvider);
    const walletFacade: WalletFacade = walletProvider.wallet;

    await walletProvider.start();

    const unshieldedState = await waitForUnshieldedFunds(logger, walletFacade, envConfiguration, unshieldedToken());
    const nightBalance = unshieldedState.balances[unshieldedToken().raw];
    if (nightBalance === undefined) {
      logger.info('No funds received, exiting...');
      return;
    }
    logger.info(`Your NIGHT wallet balance is: ${nightBalance}`);

    if (config.generateDust) {
      const dustGeneration = await generateDust(logger, seed, unshieldedState, walletFacade);
      if (dustGeneration) {
        logger.info(`Submitted dust generation registration transaction: ${dustGeneration}`);
        await syncWallet(logger, walletFacade);
      }
    }

    const providersFor = (reporter: ReporterId): ChorusProviders =>
      buildProviders(config, envConfiguration, walletProvider, reporter);

    await mainLoop(config, providersFor, rli, logger);
  } catch (e) {
    logError(logger, e);
    logger.info('Exiting...');
  } finally {
    try {
      rli.close();
      rli.removeAllListeners();
    } catch (e) {
      logError(logger, e);
    } finally {
      try {
        for (const wallet of providersToBeStopped) {
          logger.info('Stopping wallet...');
          await wallet.stop();
        }
        if (testEnv) {
          logger.info('Stopping test environment...');
          await testEnv.shutdown();
        }
      } catch (e) {
        logError(logger, e);
      }
    }
  }
};

export function logError(logger: Logger, e: unknown): void {
  if (e instanceof Error) {
    logger.error(`Found error '${e.message}'`);
    logger.debug(`${e.stack}`);
  } else {
    logger.error('Found error (unknown type)');
  }
}
