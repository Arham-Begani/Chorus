/*
 * The local reporter agent.
 *
 * WHAT THIS IS, PRECISELY — because the honesty of the demo depends on it:
 *
 * Reporting needs three things the browser does not have: a funded wallet, a
 * proof server, and the ability to sign and submit a transaction. In a
 * production Chorus that is the Lace extension's job. For this build it is
 * this process, running on localhost, holding the demo wallet and the three
 * reporter secret keys.
 *
 * So the split is:
 *
 *   REPORT  browser -> this agent (localhost) -> proof server -> testnet
 *           The raw handle is normalised and SHA-256'd IN THE BROWSER. Only
 *           the 32 hashed bytes cross to the agent, and only the commitment
 *           and nullifier reach the chain. Nothing leaves the machine except
 *           the transaction.
 *
 *   CHECK   browser -> public indexer, directly. This agent is not involved
 *           and is not even required to be running. That is the whole point of
 *           Check being free and traceless, and routing it through here would
 *           quietly destroy the property.
 *
 * If you are reading this to work out whether the demo is faked: the reports
 * are real proofs and real transactions against a real testnet contract. What
 * is staged is that all three reporters are funded from one wallet, because
 * the faucet is captcha-gated and three wallets means three captchas.
 */

import * as http from 'node:http';
import { WebSocket } from 'ws';
import { ChorusAPI, type ChorusLedgerSnapshot, type ChorusProviders } from '@chorus/api';
import { normaliseHandle } from '@chorus/contract';
import { type Logger } from 'pino';
import { type Config } from './config.js';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { type TestEnvironment } from '@midnight-ntwrk/testkit-js';
import { MidnightWalletProvider } from './midnight-wallet-provider.js';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { syncWallet, waitForUnshieldedFunds } from './wallet-utils.js';
import { generateDust } from './generate-dust.js';
import { buildProviders, isReporterId, REPORTER_IDS, type ReporterId } from './reporters.js';
import { readDeployment, writeDeployment } from './deployment.js';
import { logError } from './index.js';

const PORT = Number(process.env.CHORUS_AGENT_PORT ?? '3001');

/** JSON cannot hold a bigint, and the ledger is full of them. */
const jsonSnapshot = (snapshot: ChorusLedgerSnapshot) => ({
  totalReports: String(snapshot.totalReports),
  threshold: String(snapshot.threshold),
  nullifierCount: String(snapshot.nullifierCount),
  commitments: snapshot.commitments.map((row) => ({
    commitment: toHex(row.commitment),
    count: String(row.count),
    matched: row.matched,
  })),
});

type AgentState = {
  readonly network: string;
  readonly contractAddress: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly reporters: Record<ReporterId, ChorusAPI>;
};

const readBody = async (req: http.IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
};

const send = (res: http.ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    // The UI runs on the Vite dev server, a different port on this same
    // machine. The agent only ever binds to localhost.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(payload);
};

/**
 * Pull the reporter and handle out of a request body.
 *
 * The browser sends `handleBytes` as hex — it has already normalised and
 * hashed the handle locally. It may instead send `handle` (the raw string),
 * which the agent normalises itself; that path exists for curl and for tests,
 * not for the UI.
 */
const parseReportRequest = (
  body: Record<string, unknown>,
): { reporter: ReporterId; handle: string } | { error: string } => {
  const reporterRaw = typeof body.reporter === 'string' ? body.reporter.toUpperCase() : '';
  if (!isReporterId(reporterRaw)) {
    return { error: `reporter must be one of ${REPORTER_IDS.join(', ')}` };
  }
  const handle = typeof body.handle === 'string' ? body.handle : '';
  if (handle.trim() === '') {
    return { error: 'handle must be a non-empty string' };
  }
  return { reporter: reporterRaw, handle };
};

const createRequestHandler =
  (state: AgentState, logger: Logger) =>
  async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    if (req.method === 'OPTIONS') {
      send(res, 204, {});
      return;
    }

    try {
      switch (`${req.method} ${url.pathname}`) {
        case 'GET /api/status': {
          send(res, 200, {
            ready: true,
            network: state.network,
            contractAddress: state.contractAddress,
            indexer: state.indexer,
            indexerWS: state.indexerWS,
            reporters: REPORTER_IDS,
          });
          return;
        }

        case 'GET /api/ledger': {
          send(res, 200, jsonSnapshot(await state.reporters.A.snapshot()));
          return;
        }

        case 'POST /api/derive': {
          const parsed = parseReportRequest(await readBody(req));
          if ('error' in parsed) {
            send(res, 400, { error: parsed.error });
            return;
          }
          const derived = await state.reporters[parsed.reporter].derive(parsed.handle);
          send(res, 200, {
            normalised: normaliseHandle(parsed.handle),
            commitment: toHex(derived.commitment),
            nullifier: toHex(derived.nullifier),
          });
          return;
        }

        case 'POST /api/report': {
          const parsed = parseReportRequest(await readBody(req));
          if ('error' in parsed) {
            send(res, 400, { error: parsed.error });
            return;
          }
          logger.info(`report request from reporter ${parsed.reporter}`);
          try {
            const receipt = await state.reporters[parsed.reporter].report(parsed.handle);
            send(res, 200, {
              txHash: receipt.txHash,
              blockHeight: String(receipt.blockHeight),
              commitment: toHex(receipt.commitment),
              nullifier: toHex(receipt.nullifier),
              count: String(receipt.count),
              matched: receipt.matched,
            });
          } catch (e) {
            // A duplicate report is a legitimate, expected outcome, not a
            // server fault: the contract rejected it because the nullifier is
            // already spent. 409 says exactly that.
            const message = e instanceof Error ? e.message : String(e);
            const duplicate = message.includes('already reported this handle');
            logger.info(`report rejected: ${message}`);
            send(res, duplicate ? 409 : 500, { error: message, duplicate });
          }
          return;
        }

        default:
          send(res, 404, { error: `no route for ${req.method} ${url.pathname}` });
      }
    } catch (e) {
      logError(logger, e);
      send(res, 500, { error: e instanceof Error ? e.message : 'unknown error' });
    }
  };

export const runAgent = async (config: Config, testEnv: TestEnvironment, logger: Logger): Promise<void> => {
  // @ts-expect-error: needed to enable WebSocket usage through apollo
  globalThis.WebSocket = WebSocket;

  const envConfiguration = await testEnv.start();
  logger.info(`Environment started: proof server at ${envConfiguration.proofServer}`);

  const seed = process.env.CHORUS_WALLET_SEED;
  if (seed === undefined || seed === '') {
    throw new Error('CHORUS_WALLET_SEED must be set — the agent is non-interactive by design');
  }

  const walletProvider = await MidnightWalletProvider.build(logger, envConfiguration, seed);
  await walletProvider.start();

  const unshieldedState = await waitForUnshieldedFunds(
    logger,
    walletProvider.wallet,
    envConfiguration,
    unshieldedToken(),
  );
  logger.info(`NIGHT balance: ${unshieldedState.balances[unshieldedToken().raw]}`);

  if (config.generateDust) {
    const dustTx = await generateDust(logger, seed, unshieldedState, walletProvider.wallet);
    if (dustTx) {
      logger.info(`Dust generation tx: ${dustTx}`);
      await syncWallet(logger, walletProvider.wallet);
    }
  }

  const providersFor = (reporter: ReporterId): ChorusProviders =>
    buildProviders(config, envConfiguration, walletProvider, reporter);

  // Deploy on first run, otherwise join whatever is already recorded.
  const existing = await readDeployment(config.networkName);
  let contractAddress: string;
  if (existing === null) {
    logger.info('No deployment record — deploying a new Chorus register');
    const deployed = await ChorusAPI.deploy(providersFor('A'), logger);
    const deployTx = deployed.deployedContract.deployTxData.public;
    const snapshot = await deployed.snapshot();
    await writeDeployment({
      network: config.networkName,
      contractAddress: deployed.deployedContractAddress,
      deployTxHash: deployTx.txHash,
      blockHeight: String(deployTx.blockHeight),
      threshold: String(snapshot.threshold),
      indexer: envConfiguration.indexer,
      indexerWS: envConfiguration.indexerWS,
      deployedAt: new Date().toISOString(),
    });
    contractAddress = deployed.deployedContractAddress;
  } else {
    contractAddress = existing.contractAddress;
    logger.info(`Joining recorded register at ${contractAddress}`);
  }

  const reporters = {} as Record<ReporterId, ChorusAPI>;
  for (const reporter of REPORTER_IDS) {
    reporters[reporter] = await ChorusAPI.join(providersFor(reporter), contractAddress, logger);
    logger.info(`reporter ${reporter} ready`);
  }

  const state: AgentState = {
    network: config.networkName,
    contractAddress,
    indexer: envConfiguration.indexer,
    indexerWS: envConfiguration.indexerWS,
    reporters,
  };

  const handler = createRequestHandler(state, logger);
  const server = http.createServer((req, res) => {
    void handler(req, res);
  });

  await new Promise<void>((resolve) => {
    // localhost only. This process holds a funded wallet and three secret
    // keys; it has no business listening on a public interface.
    server.listen(PORT, '127.0.0.1', resolve);
  });

  logger.info(`Chorus reporter agent listening on http://127.0.0.1:${PORT}`);
  logger.info(`  network:  ${state.network}`);
  logger.info(`  contract: ${state.contractAddress}`);
  logger.info('Press Ctrl-C to stop.');

  await new Promise<void>((resolve) => {
    const shutdown = (): void => {
      logger.info('Stopping agent...');
      server.close(() => resolve());
      void walletProvider.stop().then(() => testEnv.shutdown());
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
};
