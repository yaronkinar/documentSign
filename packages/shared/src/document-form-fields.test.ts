import { describe, expect, it } from 'vitest';

import {
  isEditableDocumentFormField,
  resolveDocumentFormFields,
} from './document-form-fields.js';
import { HAKNASOT_FORM_TEMPLATE_ID } from './haknasot-form.js';

describe('resolveDocumentFormFields — Haknasot overrides', () => {
  it('applies a per-document override onto the matching base field', () => {
    const fields = resolveDocumentFormFields({
      formTemplateId: HAKNASOT_FORM_TEMPLATE_ID,
      formFields: [
        {
          id: 'supplier_name',
          label: '3. שם ספק',
          type: 'text',
          section: 'details',
          pageNumber: 1,
          x: 50,
          y: 40,
          width: 20,
          height: 3,
        },
      ],
    });

    const supplier = fields.find((f) => f.id === 'supplier_name');
    expect(supplier).toBeDefined();
    // overridden geometry, not the hardcoded default (64.82, 45.46)
    expect(supplier).toMatchObject({ x: 50, y: 40, width: 20, height: 3 });
    // exactly one entry for the overridden id (no duplicate base + override)
    expect(fields.filter((f) => f.id === 'supplier_name')).toHaveLength(1);
  });

  it('keeps brand-new custom fields with new ids', () => {
    const fields = resolveDocumentFormFields({
      formTemplateId: HAKNASOT_FORM_TEMPLATE_ID,
      formFields: [
        {
          id: 'my_extra_field',
          label: 'Extra',
          type: 'text',
          section: 'custom',
          pageNumber: 1,
          x: 10,
          y: 10,
          width: 10,
          height: 2,
        },
      ],
    });

    expect(fields.some((f) => f.id === 'my_extra_field')).toBe(true);
    // base fields are still present
    expect(fields.some((f) => f.id === 'supplier_name')).toBe(true);
  });

  it('leaves non-Haknasot documents resolving to their custom fields only', () => {
    const fields = resolveDocumentFormFields({
      formTemplateId: null,
      formFields: [
        {
          id: 'a',
          label: 'A',
          type: 'text',
          section: 's',
          pageNumber: 1,
          x: 1,
          y: 1,
          width: 1,
          height: 1,
        },
      ],
    });
    expect(fields).toHaveLength(1);
    expect(fields[0]!.id).toBe('a');
  });
});

describe('isEditableDocumentFormField — Haknasot', () => {
  it('treats built-in base fields as editable on Haknasot documents', () => {
    expect(
      isEditableDocumentFormField(
        { formTemplateId: HAKNASOT_FORM_TEMPLATE_ID, formFields: [] },
        'supplier_name',
      ),
    ).toBe(true);
  });

  it('does not treat unknown ids as editable', () => {
    expect(
      isEditableDocumentFormField(
        { formTemplateId: HAKNASOT_FORM_TEMPLATE_ID, formFields: [] },
        'not_a_real_field',
      ),
    ).toBe(false);
  });

  it('keeps non-Haknasot base concept: only stored fields are editable', () => {
    expect(
      isEditableDocumentFormField(
        { formTemplateId: null, formFields: [] },
        'supplier_name',
      ),
    ).toBe(false);
  });
});
