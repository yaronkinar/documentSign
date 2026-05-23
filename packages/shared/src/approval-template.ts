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

/** Signature box positions aligned with page 2 of the haknasot form. */
export const MUNICIPAL_APPROVAL_SIGNATURE_ROWS = [
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[0], pageNumber: 2, x: 38, y: 29, width: 20, height: 3.5 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[1], pageNumber: 2, x: 38, y: 32.5, width: 20, height: 3.5 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[2], pageNumber: 2, x: 38, y: 36, width: 20, height: 3.5 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[3], pageNumber: 2, x: 38, y: 39.5, width: 20, height: 3.5 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[4], pageNumber: 2, x: 38, y: 44.5, width: 20, height: 3.5 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[5], pageNumber: 2, x: 38, y: 48, width: 20, height: 3.5 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[6], pageNumber: 2, x: 38, y: 51.5, width: 20, height: 3.5 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[7], pageNumber: 2, x: 38, y: 55, width: 20, height: 3.5 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[8], pageNumber: 2, x: 38, y: 60, width: 20, height: 3.5 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[9], pageNumber: 2, x: 38, y: 63.5, width: 20, height: 3.5 },
  { label: MUNICIPAL_APPROVAL_SIGNER_TITLES[10], pageNumber: 2, x: 38, y: 67, width: 20, height: 3.5 },
] as const;

/** @deprecated Use MUNICIPAL_APPROVAL_SIGNATURE_ROWS */
export const MUNICIPAL_APPROVAL_FIELD_LAYOUT = {
  pageNumber: 2,
  x: 38,
  width: 20,
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
