import type { SignerStatus } from './index.js';

/**
 * In a sequential workflow step, signers must act in array order. Returns
 * the signer whose turn it currently is, or null if the chain is halted
 * (a signer ahead rejected) or every signer is already resolved.
 */
export function getActiveSequentialSigner<S extends { status: SignerStatus }>(
  signers: S[],
): S | null {
  for (const signer of signers) {
    if (signer.status === 'signed' || signer.status === 'skipped') continue;
    if (signer.status === 'rejected') return null;
    return signer;
  }
  return null;
}
