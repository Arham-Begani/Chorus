// Register NIGHT UTXOs for DUST generation.
//
// Ported unchanged from the bboard example. The faucet dispenses tNIGHT; DUST
// is what actually pays for transactions, and it has to be generated from
// registered NIGHT UTXOs. Older guides describing a direct tDUST drip are out
// of date.
//
// Note this opens with `waitForSyncedState()` on the dust wallet, so it cannot
// be skipped or short-circuited to avoid the dust sync.

import { type WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { createKeystore, type UnshieldedWalletState } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { type Logger } from 'pino';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as rx from 'rxjs';

export const getUnshieldedSeed = (seed: string): Uint8Array<ArrayBufferLike> => {
  const seedBuffer = Buffer.from(seed, 'hex');
  const hdWalletResult = HDWallet.fromSeed(seedBuffer);

  const { hdWallet } = hdWalletResult as {
    type: 'seedOk';
    hdWallet: HDWallet;
  };

  const derivationResult = hdWallet.selectAccount(0).selectRole(Roles.NightExternal).deriveKeyAt(0);

  if (derivationResult.type === 'keyOutOfBounds') {
    throw new Error('Key derivation out of bounds');
  }

  return derivationResult.key;
};

export const generateDust = async (
  logger: Logger,
  walletSeed: string,
  unshieldedState: UnshieldedWalletState,
  walletFacade: WalletFacade,
): Promise<string | undefined> => {
  const dustState = await walletFacade.dust.waitForSyncedState();
  const networkId = getNetworkId();
  const unshieldedKeystore = createKeystore(getUnshieldedSeed(walletSeed), networkId);
  const utxos = unshieldedState.availableCoins.filter((coin) => !coin.meta.registeredForDustGeneration);

  if (utxos.length === 0) {
    logger.info('No unregistered UTXOs found for dust generation.');
    return;
  }

  logger.info(`Generating dust with ${utxos.length} UTXOs...`);

  const recipe = await walletFacade.registerNightUtxosForDustGeneration(
    utxos,
    unshieldedKeystore.getPublicKey(),
    (payload) => unshieldedKeystore.signData(payload),
    dustState.address,
  );
  const transaction = await walletFacade.finalizeRecipe(recipe);
  const txId = await walletFacade.submitTransaction(transaction);

  const dustBalance = await rx.firstValueFrom(
    walletFacade.state().pipe(
      rx.filter((s) => s.dust.balance(new Date()) > 0n),
      rx.map((s) => s.dust.balance(new Date())),
    ),
  );
  logger.info(`Dust generation transaction submitted with txId: ${txId}`);
  logger.info(`Receiver dust balance after generation: ${dustBalance}`);

  return txId;
};
