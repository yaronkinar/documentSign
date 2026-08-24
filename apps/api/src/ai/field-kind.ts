/**
 * Tells signature placeholders apart from data fields.
 *
 * The two extraction lanes feed different layers of a template — signature
 * spots go to `fields`, data goes to `formFields` — and each was returning
 * some of the other's results. Detection is label-driven because that is the
 * only signal both the vision model and the text-line fallback agree on.
 */

/** A place someone signs, initials or stamps — never a data value. */
const SIGNATURE_LABEL = /חתימ|חותמ|חותם|ראשי\s*תיבות|signature|initials|\bsign\b|stamp/i;

/** "Date of signing" is part of a signing block; a bare "date" is data. */
const SIGNING_DATE_LABEL = /תאריך\s*חתימה|date\s*(of\s*)?sign|signed\s*(on|date)/i;

/** A bare date/name, which belongs to a signing block only in that context. */
const SIGNING_BLOCK_COMPANION = /^\s*(תאריך|date)\s*$/i;

/**
 * True for labels that mark where someone signs. Used to keep signature
 * placeholders out of the data-field layer.
 */
export function isSignaturePlaceholder(label: string): boolean {
  const text = label.trim();
  if (!text) return false;
  return SIGNATURE_LABEL.test(text) || SIGNING_DATE_LABEL.test(text);
}

/**
 * True for labels that belong to a signing block, including the bare date
 * that usually sits beside a signature line. Used to keep data fields out of
 * the signature layer, where a lone "תאריך" is the signing date.
 */
export function belongsToSigningBlock(label: string): boolean {
  const text = label.trim();
  if (!text) return false;
  return isSignaturePlaceholder(text) || SIGNING_BLOCK_COMPANION.test(text);
}
