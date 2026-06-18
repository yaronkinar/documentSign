/** A single raw row read from an uploaded signer-profile import workbook. */
export interface SignerProfileImportRow {
  row: number;
  title: string;
  name: string;
  email: string;
}

export type SignerProfileImportSkipReason = 'missing-title' | 'invalid-email';

export type SignerProfileImportRowResult =
  | { kind: 'ignore' }
  | { kind: 'skip'; row: number; reason: SignerProfileImportSkipReason }
  | { kind: 'upsert'; title: string; name: string; email: string | null };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Classifies one row of an uploaded signer-profile import sheet.
 *
 * Checks run in this priority order: a fully blank row is ignored; a row
 * missing only its title is reported as a problem (it has a name to act on
 * but nowhere to put it); a malformed email is reported next; a row with a
 * title but no name is ignored silently (expected — most pre-filled roles
 * go unused); anything else is upserted.
 */
export function classifySignerProfileImportRow(
  input: SignerProfileImportRow,
): SignerProfileImportRowResult {
  const title = input.title.trim();
  const name = input.name.trim();
  const email = input.email.trim();

  if (!title && !name) return { kind: 'ignore' };
  if (!title) return { kind: 'skip', row: input.row, reason: 'missing-title' };
  if (email && !EMAIL_PATTERN.test(email)) {
    return { kind: 'skip', row: input.row, reason: 'invalid-email' };
  }
  if (!name) return { kind: 'ignore' };

  return { kind: 'upsert', title, name, email: email || null };
}
