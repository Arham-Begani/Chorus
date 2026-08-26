// Network configuration for the Chorus CLI.
//
// Ported from the official bboard example's `config.ts`. Endpoints, network
// ids and the proof-server wiring are unchanged from the scaffold — those are
// the values that were verified working against both testnets during M0, and
// there is nothing to gain from paraphrasing them.
//
// The only Chorus-specific parts are the private-state store names and the
// `zkConfigPath`, which must point at the directory `compact compile` wrote
// the `report` circuit's prover key, verifier key and zkir into.

import path from 'node:path';
import {
  type EnvironmentConfiguration,
  getTestEnvironment,
  RemoteTestEnvironment,
  type TestEnvironment,
} from '@midnight-ntwrk/testkit-js';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { type Logger } from 'pino';

export interface Config {
  readonly privateStateStoreName: string;
  readonly logDir: string;
  readonly zkConfigPath: string;
  getEnvironment(logger: Logger): TestEnvironment;
  readonly generateDust: boolean;
  readonly networkName: string;
}

export const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');

/**
 * Where `compact compile` put the circuit assets.
 *
 * Note this points at the contract package's *source* managed directory, not
 * its `dist` copy: the CLI runs from TypeScript via ts-node, and the source
 * tree is the one that always exists whether or not the contract has been
 * built.
 */
const zkConfigPath = path.resolve(currentDir, '..', '..', 'contract', 'src', 'managed', 'chorus');

export class StandaloneConfig implements Config {
  getEnvironment(logger: Logger): TestEnvironment {
    return getTestEnvironment(logger) as TestEnvironment;
  }
  privateStateStoreName = 'chorus-private-state';
  logDir = path.resolve(currentDir, '..', 'logs', 'standalone', `${new Date().toISOString()}.log`);
  zkConfigPath = zkConfigPath;
  generateDust = false;
  networkName = 'standalone';
}

export class PreviewRemoteConfig implements Config {
  getEnvironment(logger: Logger): TestEnvironment {
    setNetworkId('preview');
    return new PreviewTestEnvironment(logger);
  }
  privateStateStoreName = 'chorus-private-state';
  logDir = path.resolve(currentDir, '..', 'logs', 'preview-remote', `${new Date().toISOString()}.log`);
  zkConfigPath = zkConfigPath;
  generateDust = true;
  networkName = 'preview';
}

export class PreprodRemoteConfig implements Config {
  getEnvironment(logger: Logger): TestEnvironment {
    setNetworkId('preprod');
    return new PreprodTestEnvironment(logger);
  }
  privateStateStoreName = 'chorus-private-state';
  logDir = path.resolve(currentDir, '..', 'logs', 'preprod-remote', `${new Date().toISOString()}.log`);
  zkConfigPath = zkConfigPath;
  generateDust = true;
  networkName = 'preprod';
}

export class PreviewTestEnvironment extends RemoteTestEnvironment {
  constructor(logger: Logger) {
    super(logger);
  }

  private getProofServerUrl(): string {
    const container = this.proofServerContainer as { getUrl(): string } | undefined;
    if (!container) {
      throw new Error('Proof server container is not available.');
    }
    return container.getUrl();
  }

  getEnvironmentConfiguration(): EnvironmentConfiguration {
    return {
      walletNetworkId: 'preview',
      networkId: 'preview',
      indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
      indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
      node: 'https://rpc.preview.midnight.network',
      nodeWS: 'wss://rpc.preview.midnight.network',
      faucet: 'https://midnight-tmnight-preview.nethermind.dev/',
      proofServer: this.getProofServerUrl(),
    };
  }
}

export class PreprodTestEnvironment extends RemoteTestEnvironment {
  constructor(logger: Logger) {
    super(logger);
  }

  private getProofServerUrl(): string {
    const container = this.proofServerContainer as { getUrl(): string } | undefined;
    if (!container) {
      throw new Error('Proof server container is not available.');
    }
    return container.getUrl();
  }

  getEnvironmentConfiguration(): EnvironmentConfiguration {
    return {
      walletNetworkId: 'preprod',
      networkId: 'preprod',
      indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
      indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
      node: 'https://rpc.preprod.midnight.network',
      nodeWS: 'wss://rpc.preprod.midnight.network',
      faucet: 'https://midnight-tmnight-preprod.nethermind.dev/',
      proofServer: this.getProofServerUrl(),
    };
  }
}
