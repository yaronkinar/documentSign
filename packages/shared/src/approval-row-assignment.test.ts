import { describe, expect, it } from 'vitest';

import { resolveApprovalRowIndices } from './template-signature-fields.js';
import { MUNICIPAL_APPROVAL_SIGNER_TITLES } from './approval-template.js';

const MANAGER = MUNICIPAL_APPROVAL_SIGNER_TITLES[0]; // אישור מנהל האגף (row 0)
const CEO = MUNICIPAL_APPROVAL_SIGNER_TITLES[10]; // אישור מנכ"ל העירייה (row 10)

describe('resolveApprovalRowIndices', () => {
  it('maps role-titled signers to their matching row, not sequential order', () => {
    // The bug: a 2-approver doc [manager, CEO] used to land CEO in row 1.
    expect(resolveApprovalRowIndices([MANAGER, CEO])).toEqual([0, 10]);
  });

  it('falls back to sequential free rows for non-matching (person) names', () => {
    const personNames = ['דוד כהן', 'רחל לוי', 'אבי שפירא'];
    expect(resolveApprovalRowIndices(personNames)).toEqual([0, 1, 2]);
  });

  it('matches role titles regardless of signer order', () => {
    // CEO first (→ row 10), then an unmatched name takes the first free row (0).
    expect(resolveApprovalRowIndices([CEO, 'דוד כהן'])).toEqual([10, 0]);
  });

  it('treats null names as non-matching, claiming free rows in order', () => {
    // Mirrors field placement: the null signer takes row 0 first, so the later
    // title-matched MANAGER is bumped to the next free row.
    expect(resolveApprovalRowIndices([null, MANAGER])).toEqual([0, 1]);
  });
});
