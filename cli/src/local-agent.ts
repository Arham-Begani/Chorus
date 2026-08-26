/*
 * The reporter agent, running against an in-process contract instead of a
 * testnet.
 *
 * BE PRECISE ABOUT WHAT THIS IS AND IS NOT.
 *
 * What is real here: the compiled Compact circuits. Commitments and nullifiers
 * are derived by `commitmentOf` and `nullifierOf` — the same circuits the chain
 * runs. A duplicate report is rejected by `assert(!seenNullifiers.member(...))`
 * inside the contract, not by a check in this file. The threshold flips because
 * the circuit flips it. Normalisation is the same shared function.
 *
 * What is NOT real: there is no proof, no transaction, no fee and no chain.
 * State lives in memory and dies with the process.
 *
 * This mode exists because the faucet is captcha-gated: a machine without a
 * funded wallet can still exercise the whole UI honestly. Anything presenting
 * output from this mode must say so — `GET /api/status` returns
 * `simulated: true` precisely so the UI can label itself and cannot quietly
 * pass this off as testnet.
 */

import * as http from 'node:http';
import { ChorusSimulator } from '@chorus/contract/simulator';
import { freshSecretKey, handleBytes as deriveHandleBytes, normaliseHandle } from '@chorus/contract';
import { type Logger } from 'pino';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { REPORTER_IDS, isReporterId, type ReporterId } from './reporters.js';
import { writeDeployment } from './deployment.js';

const PORT = Number(process.env.CHORUS_AGENT_PORT ?? '3001');

/**
 * One shared contract state, three independently random reporter keys.
 *
 * The keys must be independently random for the same reason they must be on
 * testnet: related keys produce correlatable nullifiers, and the threshold
 * demonstration would be a lie.
 */
class LocalRegister {
  private readonly simulator: ChorusSimulator;
  private readonly keys: Record<ReporterId, Uint8Array>;

  constructor() {
    const keys = {} as Record<ReporterId, Uint8Array>;
    for (const id of REPORTER_IDS) {
      keys[id] = freshSecretKey();
    }
    this.keys = keys;
    this.simulator = new ChorusSimulator(keys.A);
  }

  private as(reporter: ReporterId): ChorusSimulator {
    this.simulator.switchReporter(this.keys[reporter]);
    return this.simulator;
  }

  async derive(reporter: ReporterId, handle: string) {
    const bytes = await deriveHandleBytes(handle);
    const sim = this.as(reporter);
    return {
      normalised: normaliseHandle(handle),
      commitment: toHex(sim.commitmentOf(bytes)),
      nullifier: toHex(sim.nullifierOf(bytes)),
    };
  }

  async report(reporter: ReporterId, handle: string) {
    const bytes = await deriveHandleBytes(handle);
    const sim = this.as(reporter);
    const commitment = sim.commitmentOf(bytes);
    const nullifier = sim.nullifierOf(bytes);

    // Throws if the contract rejects it. We do not pre-check the nullifier
    // here: letting the circuit refuse is the entire point.
    sim.report(bytes);

    return {
      txHash: 'simulated',
      blockHeight: '0',
      commitment: toHex(commitment),
      nullifier: toHex(nullifier),
      count: String(sim.countOf(commitment)),
      matched: sim.isMatched(commitment),
    };
  }

  async check(handle: string) {
    const bytes = await deriveHandleBytes(handle);
    const sim = this.as('A');
    const commitment = sim.commitmentOf(bytes);
    const count = sim.countOf(commitment);
    const matched = sim.isMatched(commitment);
    return {
      commitment: toHex(commitment),
      count: String(count),
      threshold: String(sim.getLedger().threshold),
      status: count === 0n ? 'unreported' : matched ? 'matched' : 'below-threshold',
    };
  }

  snapshot() {
    const l = this.as('A').getLedger();
    const commitments: { commitment: string; count: string; matched: boolean }[] = [];
    for (const [commitment, count] of l.reportCount) {
      commitments.push({
        commitment: toHex(commitment),
        count: String(count),
        matched: l.matched.member(commitment),
      });
    }
    commitments.sort((a, b) => a.commitment.localeCompare(b.commitment));
    return {
      totalReports: String(l.totalReports),
      threshold: String(l.threshold),
      nullifierCount: String(l.seenNullifiers.size()),
      commitments,
    };
  }
}

const readBody = async (req: http.IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return chunks.length === 0 ? {} : (JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
};

const send = (res: http.ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(payload);
};

const parseRequest = (body: Record<string, unknown>): { reporter: ReporterId; handle: string } | { error: string } => {
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

export const runLocalAgent = async (logger: Logger): Promise<void> => {
  const register = new LocalRegister();

  // The UI reads this to discover the register. `network: 'local'` is what
  // switches it into reading the ledger from here rather than from an indexer,
  // and what makes it render the simulated-mode banner.
  await writeDeployment({
    network: 'local',
    contractAddress: 'local-simulator (no chain)',
    deployTxHash: '',
    blockHeight: '0',
    threshold: register.snapshot().threshold,
    indexer: '',
    indexerWS: '',
    deployedAt: new Date().toISOString(),
  });

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

      if (req.method === 'OPTIONS') {
        send(res, 204, {});
        return;
      }

      try {
        switch (`${req.method} ${url.pathname}`) {
          case 'GET /api/status':
            send(res, 200, {
              ready: true,
              simulated: true,
              network: 'local',
              contractAddress: 'local-simulator (no chain)',
              reporters: REPORTER_IDS,
            });
            return;

          case 'GET /api/ledger':
            send(res, 200, register.snapshot());
            return;

          case 'POST /api/check': {
            const body = await readBody(req);
            const handle = typeof body.handle === 'string' ? body.handle : '';
            if (handle.trim() === '') {
              send(res, 400, { error: 'handle must be a non-empty string' });
              return;
            }
            send(res, 200, await register.check(handle));
            return;
          }

          case 'POST /api/derive': {
            const parsed = parseRequest(await readBody(req));
            if ('error' in parsed) {
              send(res, 400, { error: parsed.error });
              return;
            }
            send(res, 200, await register.derive(parsed.reporter, parsed.handle));
            return;
          }

          case 'POST /api/report': {
            const parsed = parseRequest(await readBody(req));
            if ('error' in parsed) {
              send(res, 400, { error: parsed.error });
              return;
            }
            try {
              const receipt = await register.report(parsed.reporter, parsed.handle);
              logger.info(`reporter ${parsed.reporter} -> count ${receipt.count}${receipt.matched ? ' MATCHED' : ''}`);
              send(res, 200, receipt);
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e);
              const duplicate = message.includes('already reported this handle');
              logger.info(`reporter ${parsed.reporter} rejected: ${message}`);
              send(res, duplicate ? 409 : 500, { error: message, duplicate });
            }
            return;
          }

          default:
            send(res, 404, { error: `no route for ${req.method} ${url.pathname}` });
        }
      } catch (e) {
        send(res, 500, { error: e instanceof Error ? e.message : 'unknown error' });
      }
    })();
  });

  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  logger.info(`Chorus reporter agent (LOCAL SIMULATION) on http://127.0.0.1:${PORT}`);
  logger.info('Real circuits, real derivations, real nullifier and threshold logic.');
  logger.info('No proof, no transaction, no chain. State is in memory.');

  await new Promise<void>((resolve) => {
    const shutdown = (): void => {
      server.close(() => resolve());
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
};
