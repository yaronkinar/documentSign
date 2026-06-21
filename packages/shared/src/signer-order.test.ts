import { describe, expect, it } from 'vitest';

import { getActiveSequentialSigner } from './signer-order.js';

function signer(status: 'pending' | 'signed' | 'rejected' | 'skipped', email: string) {
  return { status, email };
}

describe('getActiveSequentialSigner', () => {
  it('returns null for an empty list', () => {
    expect(getActiveSequentialSigner([])).toBeNull();
  });

  it('returns the first signer when all are pending', () => {
    const signers = [signer('pending', 'a@test.com'), signer('pending', 'b@test.com')];
    expect(getActiveSequentialSigner(signers)).toBe(signers[0]);
  });

  it('skips signed and skipped signers to find the next pending one', () => {
    const signers = [
      signer('signed', 'a@test.com'),
      signer('skipped', 'b@test.com'),
      signer('pending', 'c@test.com'),
    ];
    expect(getActiveSequentialSigner(signers)).toBe(signers[2]);
  });

  it('returns null when a rejected signer blocks the chain', () => {
    const signers = [
      signer('signed', 'a@test.com'),
      signer('rejected', 'b@test.com'),
      signer('pending', 'c@test.com'),
    ];
    expect(getActiveSequentialSigner(signers)).toBeNull();
  });

  it('returns null when every signer is resolved', () => {
    const signers = [signer('signed', 'a@test.com'), signer('skipped', 'b@test.com')];
    expect(getActiveSequentialSigner(signers)).toBeNull();
  });
});
