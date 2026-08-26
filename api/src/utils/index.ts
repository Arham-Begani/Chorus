/**
 * Small shared utilities.
 *
 * @module
 */

/**
 * Generate `length` cryptographically random bytes.
 *
 * Used for wallet seeds and reporter secret keys. Never replace this with
 * anything derived from a counter, a timestamp or an index: reporter keys that
 * are related to each other produce nullifiers an observer could correlate,
 * which would break the unlinkability the whole design rests on.
 */
export const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

/** Truncate a hex string for display: `0x1a2b3c…9f8e7d`. */
export const truncateHex = (hex: string, lead = 8, tail = 6): string =>
  hex.length <= lead + tail ? hex : `${hex.slice(0, lead)}…${hex.slice(-tail)}`;
