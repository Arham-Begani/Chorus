/**
 * One config module. Contract address, network id and agent URL live here and
 * nowhere else.
 *
 * The deployment record is fetched at runtime rather than baked in at build
 * time, so redeploying the contract does not require rebuilding the frontend —
 * the CLI writes `ui/public/deployment.json` when it deploys.
 */

export type Deployment = {
  readonly network: string;
  readonly contractAddress: string;
  readonly deployTxHash: string;
  readonly blockHeight: string;
  readonly threshold: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly deployedAt: string;
};

/** Public indexers, by network. Used when the deployment record omits them. */
const INDEXERS: Record<string, { indexer: string; indexerWS: string }> = {
  preview: {
    indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  },
  preprod: {
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  },
};

/**
 * Where the local reporter agent listens.
 *
 * Reporting needs a wallet, a proof server and the ability to submit a
 * transaction — in production that is the Lace extension's job; here it is a
 * process on this machine. Checking does NOT go through it.
 */
export const AGENT_URL = import.meta.env.VITE_CHORUS_AGENT_URL ?? 'http://127.0.0.1:3001';

export const loadDeployment = async (): Promise<Deployment> => {
  const response = await fetch('/deployment.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(
      'No deployment.json — deploy the contract first (npm run deploy:preview) so the UI knows which register to read.',
    );
  }
  const record = (await response.json()) as Deployment;

  const fallback = INDEXERS[record.network];
  return {
    ...record,
    indexer: record.indexer !== '' ? record.indexer : (fallback?.indexer ?? ''),
    indexerWS: record.indexerWS !== '' ? record.indexerWS : (fallback?.indexerWS ?? ''),
  };
};
