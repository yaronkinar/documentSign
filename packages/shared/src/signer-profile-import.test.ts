import { describe, expect, it } from 'vitest';

import { classifySignerProfileImportRow } from './signer-profile-import.js';

describe('classifySignerProfileImportRow', () => {
  it('ignores a fully blank row', () => {
    const result = classifySignerProfileImportRow({
      row: 2,
      title: '',
      name: '',
      email: '',
    });
    expect(result).toEqual({ kind: 'ignore' });
  });

  it('ignores a pre-filled role row with no name typed in', () => {
    const result = classifySignerProfileImportRow({
      row: 2,
      title: 'Engineer',
      name: '',
      email: '',
    });
    expect(result).toEqual({ kind: 'ignore' });
  });

  it('skips a row with a name but no title', () => {
    const result = classifySignerProfileImportRow({
      row: 3,
      title: '',
      name: 'Jane Doe',
      email: '',
    });
    expect(result).toEqual({ kind: 'skip', row: 3, reason: 'missing-title' });
  });

  it('skips a row with a malformed email', () => {
    const result = classifySignerProfileImportRow({
      row: 4,
      title: 'Engineer',
      name: 'Jane Doe',
      email: 'not-an-email',
    });
    expect(result).toEqual({ kind: 'skip', row: 4, reason: 'invalid-email' });
  });

  it('upserts a row with title + name and no email', () => {
    const result = classifySignerProfileImportRow({
      row: 5,
      title: 'Engineer',
      name: 'Jane Doe',
      email: '',
    });
    expect(result).toEqual({
      kind: 'upsert',
      title: 'Engineer',
      name: 'Jane Doe',
      email: null,
    });
  });

  it('upserts a row with title + name + valid email, trimmed', () => {
    const result = classifySignerProfileImportRow({
      row: 6,
      title: '  Engineer  ',
      name: '  Jane Doe  ',
      email: '  jane@example.com  ',
    });
    expect(result).toEqual({
      kind: 'upsert',
      title: 'Engineer',
      name: 'Jane Doe',
      email: 'jane@example.com',
    });
  });

  it('upserts a row with a custom title not in any known role list', () => {
    const result = classifySignerProfileImportRow({
      row: 7,
      title: 'Extra Reviewer',
      name: 'Jane Doe',
      email: '',
    });
    expect(result.kind).toBe('upsert');
  });
});
