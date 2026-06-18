import type { SignatureFieldTemplate } from './signature-field-template.js';

export type { SignatureFieldTemplate };

/** Municipal approval roles (items 13–23) from the standard Hebrew agreement form. */
export const MUNICIPAL_APPROVAL_SIGNER_TITLES = [
  'אישור מנהל האגף',
  'אישור ראש המנהל',
  'אישור יועץ משפטי',
  'אישור מנהל אגף נכסים',
  'אישור חשב האגף',
  'אישור מהנדס העירייה',
  'אישור מ. אגף מכרזים',
  'אישור מנהל אגף תכנון ופיתוח כלכלי',
  'אישור מ.אגף גזברות',
  'אישור גזבר העירייה',
  'אישור מנכ"ל העירייה',
] as const;

/**
 * Signature (חתימה) column boxes for the approval table on pages 3-4 of the
 * new haknasot form. Name + date columns are stamped relative to these (see
 * the renderer's APPROVAL_NAME_BOX / APPROVAL_DATE_BOX).
 */
export const MUNICIPAL_APPROVAL_SIGNATURE_ROWS = [
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[0], pageNumber: 3, x: 21.1, y: 15.5, width: 15.6, height: 4.5 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[1], pageNumber: 3, x: 21.1, y: 33.0, width: 15.6, height: 5.0 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[2], pageNumber: 3, x: 21.1, y: 49.4, width: 15.6, height: 5.0 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[3], pageNumber: 3, x: 21.1, y: 57.0, width: 15.6, height: 5.0 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[4], pageNumber: 3, x: 21.1, y: 64.7, width: 15.6, height: 5.0 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[5], pageNumber: 3, x: 21.1, y: 72.4, width: 15.6, height: 5.0 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[6], pageNumber: 3, x: 21.1, y: 80.0, width: 15.6, height: 5.0 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[7], pageNumber: 4, x: 21.1, y: 7.0, width: 15.6, height: 5.0 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[8], pageNumber: 4, x: 21.1, y: 21.4, width: 15.6, height: 5.0 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[9], pageNumber: 4, x: 21.1, y: 29.0, width: 15.6, height: 5.0 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[10], pageNumber: 4, x: 21.1, y: 36.7, width: 15.6, height: 5.0 },
] as const;

/** @deprecated Use MUNICIPAL_APPROVAL_SIGNATURE_ROWS */
export const MUNICIPAL_APPROVAL_FIELD_LAYOUT = {
  pageNumber: 2,
  x: 29,
  width: 10,
  height: 3.5,
  startY: 29,
  rowGap: 3.5,
} as const;

/** Signature slots aligned with page 2 of the haknasot form. */
export const HEBREW_MULTI_SIGNER_FIELD_TEMPLATE: SignatureFieldTemplate[] =
  MUNICIPAL_APPROVAL_SIGNATURE_ROWS.map((row) => ({
    pageNumber: row.pageNumber,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    label: row.label,
  }));
