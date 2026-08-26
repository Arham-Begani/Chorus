// Wallet sync helpers.
//
// Ported from the bboard example with the two M0 patches that made a live
// testnet usable, both documented in the README:
//
//   1. Progress logging that handles BOTH progress shapes. The three
//      sub-wallets use different field names — unshielded reports
//      `appliedId`/`highestTransactionId`, shielded and dust report
//      `appliedIndex`/`highestRelevantWalletIndex` — so naive logging silently
//      reports 0% forever for two of the three.
//
//   2. `isCompleteWithin(SYNC_MAX_GAP)` instead of `isStrictlyComplete()`.
//      `isStrictlyComplete()` is literally `isCompleteWithin(0n)`: it demands
//      zero lag against a chain tip that keeps advancing, which on a live
//      network may never be true. The SDK's own default tolerance is 50n.
//
// Both patches are test-harness only. The contract is untouched.

import { type UnshieldedTokenType } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { type FacadeState, type WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { type ShieldedWalletAPI, type ShieldedWalletState } from '@midnight-ntwrk/wallet-sdk-shielded';
import { type UnshieldedWalletAPI, type UnshieldedWalletState } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import * as Rx from 'rxjs';

import { FaucetClient, type EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
import { type Logger } from 'pino';
import { UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

export const getInitialShieldedState = async (
  logger: Logger,
  wallet: ShieldedWalletAPI,
): Promise<ShieldedWalletState> => {
  logger.info('Getting initial state of wallet...');
  return Rx.firstValueFrom(wallet.state);
};

export const getInitialUnshieldedState = async (
  logger: Logger,
  wallet: UnshieldedWalletAPI,
): Promise<UnshieldedWalletState> => {
  logger.info('Getting initial state of wallet...');
  return Rx.firstValueFrom(wallet.state);
};

const SYNC_MAX_GAP = BigInt(process.env.SYNC_MAX_GAP ?? '50');

export const progressInfo = (progress: unknown): string => {
  const p = progress as Record<string, unknown> | null;
  if (!p || typeof p !== 'object') {
    return 'n/a';
  }
  const num = (v: unknown): bigint => (typeof v === 'bigint' ? v : BigInt((v as string) ?? 0));
  // unshielded wallet shape
  if (p.appliedId !== undefined) {
    const a = num(p.appliedId);
    const h = num(p.highestTransactionId);
    const pct = h > 0n ? Number((a * 10000n) / h) / 100 : 100;
    return `${a}/${h} (${pct.toFixed(2)}%) conn=${String(p.isConnected)}`;
  }
  // shielded / dust wallet shape
  const a = num(p.appliedIndex);
  const h = num(p.highestRelevantWalletIndex);
  const pct = h > 0n ? Number((a * 10000n) / h) / 100 : 0;
  return `${a}/${h} (${pct.toFixed(2)}%) conn=${String(p.isConnected)}`;
};

const isProgressStrictlyComplete = (progress: unknown): boolean => {
  if (!progress || typeof progress !== 'object') {
    return false;
  }
  const candidate = progress as { isCompleteWithin?: unknown; isStrictlyComplete?: unknown };
  if (typeof candidate.isCompleteWithin === 'function') {
    return (candidate.isCompleteWithin as (gap: bigint) => boolean)(SYNC_MAX_GAP);
  }
  if (typeof candidate.isStrictlyComplete !== 'function') {
    return false;
  }
  return (candidate.isStrictlyComplete as () => boolean)();
};

const isFacadeStateSynced = (state: FacadeState): boolean =>
  isProgressStrictlyComplete(state.shielded.state.progress) &&
  isProgressStrictlyComplete(state.dust.state.progress) &&
  isProgressStrictlyComplete(state.unshielded.progress);

const logProgress = (logger: Logger, state: FacadeState): void => {
  logger.debug(
    `sync: shielded[${progressInfo(state.shielded.state.progress)}] ` +
      `dust[${progressInfo(state.dust.state.progress)}] ` +
      `unshielded[${progressInfo(state.unshielded.progress)}]`,
  );
};

export const syncWallet = (logger: Logger, wallet: WalletFacade, throttleTime = 2_000): Promise<FacadeState> => {
  logger.info('Syncing wallet...');

  return Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(throttleTime),
      Rx.tap((state: FacadeState) => logProgress(logger, state)),
      Rx.filter((state: FacadeState) => isFacadeStateSynced(state)),
      Rx.tap(() => logger.info('Sync complete')),
      Rx.tap((state: FacadeState) => {
        logger.info(
          `Wallet balances after sync - Shielded: ${JSON.stringify(state.shielded.balances ?? {})}, ` +
            `Unshielded: ${JSON.stringify(state.unshielded.balances ?? {})}, ` +
            `Dust: ${state.dust.balance(new Date()) ?? 0n}`,
        );
      }),
    ),
  );
};

export const waitForUnshieldedFunds = async (
  logger: Logger,
  wallet: WalletFacade,
  env: EnvironmentConfiguration,
  tokenType: UnshieldedTokenType,
  fundFromFaucet = false,
  throttleTime = 2_000,
): Promise<UnshieldedWalletState> => {
  const initialState = await getInitialUnshieldedState(logger, wallet.unshielded);
  const unshieldedAddress = UnshieldedAddress.codec.encode(getNetworkId(), initialState.address);
  logger.info(`Using unshielded address: ${unshieldedAddress.toString()}`);

  if (fundFromFaucet && env.faucet) {
    logger.info('Requesting tokens from faucet...');
    await new FaucetClient(env.faucet, logger).requestTokens(unshieldedAddress.toString());
  }

  const initialBalance = initialState.balances[tokenType.raw];
  if (initialBalance === undefined || initialBalance === 0n) {
    logger.info('Your wallet initial balance is: 0 (not yet initialized)');
    logger.info('Waiting to receive tokens...');
    logger.info(`>>> Fund this address at ${env.faucet ?? 'the faucet'} : ${unshieldedAddress.toString()}`);
    return Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.throttleTime(throttleTime),
        Rx.tap((state: FacadeState) => {
          const balance = state.unshielded.balances[tokenType.raw] ?? 0n;
          logger.debug(`funds: synced=${isFacadeStateSynced(state)} balance=${balance.toString()}`);
          logProgress(logger, state);
        }),
        Rx.filter(
          (state: FacadeState) => isFacadeStateSynced(state) && (state.unshielded.balances[tokenType.raw] ?? 0n) > 0n,
        ),
        Rx.tap(() => logger.info('Sync complete, funds received')),
        Rx.map((state: FacadeState) => state.unshielded),
      ),
    );
  }
  return initialState;
};
