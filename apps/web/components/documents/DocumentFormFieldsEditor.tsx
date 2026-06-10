'use client';

import { useState } from 'react';
import type { DocumentDto, PdfFormFieldTemplate, PdfFormFieldType } from '@docflow/shared';
import { isEditableDocumentFormField } from '@docflow/shared';

import { DocumentFormTypePicker } from '@/components/documents/DocumentFormTypePicker';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

interface Props {
  doc: DocumentDto;
  fields: PdfFormFieldTemplate[];
  busy: boolean;
  formFieldPlacementMode: boolean;
  onStartAddField: () => void;
  onCancelAddField: () => void;
  onSelectTemplate: (formTemplateId: string) => void;
  onExtractFromPdf: () => void;
  onUpdateField: (
    fieldId: string,
    patch: { label?: string; type?: PdfFormFieldType },
  ) => void;
  onDeleteField: (fieldId: string) => void;
  onSelectField: (fieldId: string | null) => void;
  activeFieldId: string | null;
  onContinueToFill?: () => void;
}

export function DocumentFormFieldsEditor({
  doc,
  fields,
  busy,
  formFieldPlacementMode,
  onStartAddField,
  onCancelAddField,
  onSelectTemplate,
  onExtractFromPdf,
  onUpdateField,
  onDeleteField,
  onSelectField,
  activeFieldId,
  onContinueToFill,
}: Props) {
  const { t } = useTranslation();
  const hasUploadedPdf = doc.hasPdfFile ?? !!doc.fileUrl;
  const customFields = fields.filter((field) =>
    isEditableDocumentFormField(doc, field.id),
  );

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-fg-muted">{t('document.manualFormFieldsHint')}</p>
      {customFields.length > 0 && !formFieldPlacementMode && (
        <p className="text-xs text-fg-muted">{t('document.dragFormFieldToMove')}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={formFieldPlacementMode ? 'default' : 'default'}
          disabled={busy || !hasUploadedPdf}
          onClick={
            formFieldPlacementMode ? onCancelAddField : onStartAddField
          }
        >
          {formFieldPlacementMode
            ? t('common.done')
            : t('document.addFormField')}
        </Button>
        {hasUploadedPdf && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onExtractFromPdf}
          >
            {fields.length > 0
              ? t('document.reDetectFormFields')
              : t('document.extractFormFromPdf')}
          </Button>
        )}
      </div>

      {formFieldPlacementMode && (
        <p className="rounded-md border border-info/30 bg-info/5 px-3 py-2 text-xs text-fg">
          {t('document.clickToPlaceFormField')}
        </p>
      )}

      {!hasFormFields(doc) && hasUploadedPdf && !busy && (
        <DocumentFormTypePicker
          hasUploadedPdf={hasUploadedPdf}
          busy={busy}
          onSelect={onSelectTemplate}
          onExtractFromPdf={onExtractFromPdf}
        />
      )}

      {fields.length > 0 && !formFieldPlacementMode && onContinueToFill && (
        <Button type="button" className="w-full" onClick={onContinueToFill}>
          {t('document.continueToFillForm')}
        </Button>
      )}

      {customFields.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {t('document.formFieldsList')}
          </p>
          <ul className="space-y-2">
            {customFields.map((field) => (
              <FormFieldRow
                key={field.id}
                field={field}
                selected={activeFieldId === field.id}
                disabled={busy}
                onSelect={() =>
                  onSelectField(activeFieldId === field.id ? null : field.id)
                }
                onUpdate={onUpdateField}
                onDelete={onDeleteField}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function hasFormFields(doc: DocumentDto): boolean {
  return (doc.formFields?.length ?? 0) > 0;
}

function FormFieldRow({
  field,
  selected,
  disabled,
  onSelect,
  onUpdate,
  onDelete,
}: {
  field: PdfFormFieldTemplate;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onUpdate: (
    fieldId: string,
    patch: { label?: string; type?: PdfFormFieldType },
  ) => void;
  onDelete: (fieldId: string) => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(field.label);
  const [type, setType] = useState<PdfFormFieldType>(field.type);

  return (
    <li
      className={`rounded-md border px-2 py-2 ${
        selected ? 'border-info bg-info/5' : 'border-border bg-surface-muted'
      }`}
    >
      <button
        type="button"
        className="mb-2 w-full text-left text-xs font-medium text-fg"
        onClick={onSelect}
      >
        {field.label}{' '}
        <span className="text-fg-muted">
          ({t('document.page', { n: field.pageNumber })})
        </span>
      </button>
      {selected && (
        <div className="space-y-2">
          <label className="block text-xs">
            <span className="text-fg-muted">{t('document.formFieldLabel')}</span>
            <input
              className="mt-1 w-full rounded border border-input bg-background px-2 py-1 text-sm"
              value={label}
              disabled={disabled}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => {
                if (label.trim() && label.trim() !== field.label) {
                  onUpdate(field.id, { label: label.trim() });
                }
              }}
            />
          </label>
          <label className="block text-xs">
            <span className="text-fg-muted">{t('document.formFieldType')}</span>
            <select
              className="mt-1 w-full rounded border border-input bg-background px-2 py-1 text-sm"
              value={type}
              disabled={disabled}
              onChange={(e) => {
                const next = e.target.value as PdfFormFieldType;
                setType(next);
                onUpdate(field.id, { type: next });
              }}
            >
              <option value="text">{t('document.formFieldTypeText')}</option>
              <option value="textarea">{t('document.formFieldTypeTextarea')}</option>
              <option value="date">{t('document.formFieldTypeDate')}</option>
            </select>
          </label>
          <Button
            type="button"
            size="sm"
            variant="link"
            disabled={disabled}
            className="h-auto px-0 text-xs text-danger"
            onClick={() => onDelete(field.id)}
          >
            {t('document.deleteFormField')}
          </Button>
        </div>
      )}
    </li>
  );
}
