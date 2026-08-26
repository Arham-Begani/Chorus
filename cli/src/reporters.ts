// Three reporters, three genuinely separate secret keys.
//
// The threshold demonstration is only meaningful if the three reporters are
// unlinkable. That means three independently random secret keys producing
// three independent nullifiers — NOT one key with a counter, which would be a
// fake and would produce nullifiers an observer could trivially correlate.
//
// Isolation is achieved by giving each reporter its own private-state store.
// Two reporters sharing a store would share a key, their nullifiers would
// collide, and the second report would be rejected as a duplicate — which is
// exactly the bug that would make the demo look like it works while proving
// nothing.

import { type ChorusProviders, type PrivateStateId } from '@chorus/api';
import { type ChorusPrivateState } from '@chorus/contract';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { type EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
import { type Config } from './config.js';
import { type MidnightWalletProvider } from './midnight-wallet-provider.js';

/** The circuit that writes. `report` is the only one. */
export type ChorusCircuits = 'report';

export const REPORTER_IDS = ['A', 'B', 'C'] as const;
export type ReporterId = (typeof REPORTER_IDS)[number];

export const isReporterId = (value: string): value is ReporterId =>
  (REPORTER_IDS as readonly string[]).includes(value);

/**
 * Build a provider set for one reporter.
 *
 * The wallet, proof server, indexer and zk config are shared — those are
 * infrastructure, and in the demo all three reporters are funded from the same
 * testnet wallet because obtaining three separately funded wallets means
 * solving three captchas. That sharing is visible on chain as one payer, and
 * the README says so plainly.
 *
 * What is NOT shared is the private state, which is where the reporter secret
 * lives. The nullifiers are what the contract's privacy claim rests on, and
 * those are genuinely independent.
 */
export const buildProviders = (
  config: Config,
  env: EnvironmentConfiguration,
  walletProvider: MidnightWalletProvider,
  reporter: ReporterId,
): ChorusProviders => {
  const zkConfigProvider = new NodeZkConfigProvider<ChorusCircuits>(config.zkConfigPath);

  return {
    privateStateProvider: levelPrivateStateProvider<PrivateStateId, ChorusPrivateState>({
      privateStateStoreName: `${config.privateStateStoreName}-${reporter}`,
      signingKeyStoreName: `${config.privateStateStoreName}-${reporter}-signing-keys`,
      privateStoragePasswordProvider: () => 'Chorus-Demo-2026!',
      accountId: `${walletProvider.seed}-${reporter}`,
    }),
    publicDataProvider: indexerPublicDataProvider(env.indexer, env.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(env.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
};
