/**
 * Handle normalisation — the single point of failure for the entire product.
 *
 * Two victims of the same scammer must derive the SAME commitment from what
 * they each type, or they never match and Chorus silently does nothing. There
 * is no error message for this failure mode: the counter just stays at 1 and
 * everybody assumes they are alone. That is precisely the outcome Chorus
 * exists to prevent.
 *
 * Consequently this function must be used by BOTH Report and Check, on every
 * client, forever. Changing it after any reports exist is a breaking change:
 * old commitments become unreachable, because the commitment is a hash of the
 * normalised form.
 */

/**
 * Normalise a payment handle (UPI ID, wallet address, phone number) to a
 * canonical form.
 *
 * The rules are deliberately conservative — only transformations that cannot
 * merge two genuinely different handles:
 *   - strip all Unicode whitespace (leading, trailing, and internal)
 *   - lowercase, using a locale-independent mapping
 *   - normalise Unicode to NFKC so visually identical strings compare equal
 *
 * We do NOT strip punctuation, dots, or plus-addressing: `a.b@upi` and
 * `ab@upi` are different handles at different institutions, and collapsing
 * them would let one merchant's reports land on another's commitment.
 */
export const normaliseHandle = (raw: string): string =>
  raw
    .normalize('NFKC')
    .replace(/\s+/gu, '')
    .toLowerCase();

/**
 * SHA-256 of the normalised handle, as the 32 bytes the circuit expects.
 *
 * The contract takes `handleBytes: Bytes<32>` rather than a string because
 * Compact circuits work over fixed-width byte vectors. Hashing client-side
 * also means a handle of any length maps to exactly 32 bytes.
 *
 * Uses WebCrypto, which is available in both Node 24 and the browser, so
 * Report and Check share one implementation rather than two that can drift.
 */
export const handleBytes = async (raw: string): Promise<Uint8Array> => {
  const normalised = normaliseHandle(raw);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalised),
  );
  return new Uint8Array(digest);
};
