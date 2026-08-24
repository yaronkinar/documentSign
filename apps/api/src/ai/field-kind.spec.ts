import { belongsToSigningBlock, isSignaturePlaceholder } from './field-kind';

describe('isSignaturePlaceholder', () => {
  it.each([
    'חתימה',
    'חתימת עורך הבקשה',
    'חותמת הוועדה',
    'ראשי תיבות',
    'Signature',
    'Initials',
    'תאריך חתימה',
  ])('treats %s as a signature placeholder', (label) => {
    expect(isSignaturePlaceholder(label)).toBe(true);
  });

  it.each([
    'מספר בקשה',
    'שם המבקש',
    'כתובת הנכס',
    'שטח עיקרי',
    'תאריך',
    'Date',
  ])('treats %s as a data field', (label) => {
    expect(isSignaturePlaceholder(label)).toBe(false);
  });

  it('ignores blank labels', () => {
    expect(isSignaturePlaceholder('   ')).toBe(false);
  });
});

describe('belongsToSigningBlock', () => {
  it('includes the bare date that sits beside a signature line', () => {
    // In the signature lane a lone "date" is the date of signing, so it stays
    // with the signing block rather than being treated as a data field.
    expect(belongsToSigningBlock('תאריך')).toBe(true);
    expect(belongsToSigningBlock('Date')).toBe(true);
  });

  it('still covers signature placeholders', () => {
    expect(belongsToSigningBlock('חתימה')).toBe(true);
  });

  it('excludes ordinary data fields', () => {
    expect(belongsToSigningBlock('מספר בקשה')).toBe(false);
    expect(belongsToSigningBlock('תאריך התחלה')).toBe(false);
  });
});
