'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { PdfTemplateDto } from '@docflow/shared';
import type { PdfFormFieldTemplate, PdfFormFieldType } from '@docflow/shared';

import { PDFViewer, type TemplateEditField } from '@/components/pdf/PDFViewer';
import { useApiClient } from '@/lib/api-client';
import { ensureSignerProfilesForRoles } from '@/lib/signer-profile-workflow';

interface Props {
  template: PdfTemplateDto;
}

interface ExtractTemplateFieldsResponse {
  fields: Array<{
    label: string;
    pageNumber: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

let localFieldCounter = 0;

function uniqueFieldLabels(fields: Array<{ label: string }>): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const field of fields) {
    const label = field.label.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

function toEditFields(template: PdfTemplateDto): TemplateEditField[] {
  return template.fields.map((f) => ({
    id: f._id,
    label: f.label,
    pageNumber: f.pageNumber,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
  }));
}

export function TemplateEditorClient({ template }: Props) {
  const router = useRouter();
  const api = useApiClient();

  const [name, setName] = useState(template.name);
  const [isDefault, setIsDefault] = useState(template.isDefault);
  const [fields, setFields] = useState<TemplateEditField[]>(toEditFields(template));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  type EditorMode = 'signatures' | 'form-fields';

  const [mode, setMode] = useState<EditorMode>('signatures');
  const [formFields, setFormFields] = useState<PdfFormFieldTemplate[]>(template.formFields ?? []);
  const [activeFormFieldId, setActiveFormFieldId] = useState<string | null>(null);
  const [formFieldPlacementMode, setFormFieldPlacementMode] = useState(false);
  const [formFieldBusy, setFormFieldBusy] = useState(false);
  const [formFieldError, setFormFieldError] = useState<string | null>(null);

  const selectedField = fields.find((f) => f.id === selectedId) ?? null;

  const handleFieldAdd = useCallback(
    (page: number, x: number, y: number) => {
      const id = `new-${++localFieldCounter}`;
      const newField: TemplateEditField = {
        id,
        label: `Field ${fields.length + 1}`,
        pageNumber: page,
        x,
        y,
        width: 20,
        height: 6,
      };
      setFields((prev) => [...prev, newField]);
      setSelectedId(id);
      setAddMode(false);
    },
    [fields.length],
  );

  const handleFieldMove = useCallback((id: string, x: number, y: number) => {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, x, y } : f)),
    );
  }, []);

  const handleFieldResize = useCallback(
    (id: string, width: number, height: number) => {
      setFields((prev) =>
        prev.map((f) => (f.id === id ? { ...f, width, height } : f)),
      );
    },
    [],
  );

  function updateSelectedLabel(label: string) {
    if (!selectedId) return;
    setFields((prev) =>
      prev.map((f) => (f.id === selectedId ? { ...f, label } : f)),
    );
  }

  function deleteSelected() {
    if (!selectedId) return;
    setFields((prev) => prev.filter((f) => f.id !== selectedId));
    setSelectedId(null);
  }

  async function handleExtractFields() {
    if (fields.length > 0) {
      const shouldReplace = confirm(
        'Replace the current draft fields with AI-detected fields?',
      );
      if (!shouldReplace) return;
    }

    setExtracting(true);
    setExtractError(null);
    setSaved(false);
    try {
      const res = await api.post<ExtractTemplateFieldsResponse>(
        `/templates/${template._id}/extract-fields`,
      );
      const nextFields = res.fields.map((field, index) => ({
        id: `ai-${Date.now()}-${index}`,
        ...field,
      }));
      setFields(nextFields);
      setSelectedId(nextFields[0]?.id ?? null);
      setAddMode(false);
      if (nextFields.length > 0) {
        void ensureSignerProfilesForRoles(
          api,
          template._id,
          uniqueFieldLabels(nextFields),
        );
      } else {
        setExtractError('AI did not find any fields in this PDF.');
      }
    } catch (err) {
      setExtractError(
        err instanceof Error ? err.message : 'Failed to extract fields',
      );
    } finally {
      setExtracting(false);
    }
  }

  async function onFormFieldPlace(page: number, x: number, y: number) {
    if (!formFieldPlacementMode) return;
    setFormFieldError(null);
    try {
      const res = await api.post<{ formFields: PdfFormFieldTemplate[] }>(
        `/templates/${template._id}/form-fields`,
        {
          label: `Field ${formFields.length + 1}`,
          pageNumber: page,
          x: Number(x.toFixed(2)),
          y: Number(y.toFixed(2)),
        },
      );
      setFormFields(res.formFields);
      setActiveFormFieldId(res.formFields.at(-1)?.id ?? null);
      setFormFieldPlacementMode(false);
    } catch (err) {
      setFormFieldError(err instanceof Error ? err.message : 'Failed to add field');
    }
  }

  async function onFormFieldMove(fieldId: string, page: number, x: number, y: number) {
    setFormFieldError(null);
    try {
      const res = await api.patch<{ formFields: PdfFormFieldTemplate[] }>(
        `/templates/${template._id}/form-fields/${fieldId}`,
        { pageNumber: page, x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) },
      );
      setFormFields(res.formFields);
    } catch (err) {
      setFormFieldError(err instanceof Error ? err.message : 'Failed to move field');
    }
  }

  async function onFormFieldResize(fieldId: string, width: number, height: number) {
    setFormFieldError(null);
    try {
      const res = await api.patch<{ formFields: PdfFormFieldTemplate[] }>(
        `/templates/${template._id}/form-fields/${fieldId}`,
        { width: Number(width.toFixed(2)), height: Number(height.toFixed(2)) },
      );
      setFormFields(res.formFields);
    } catch (err) {
      setFormFieldError(err instanceof Error ? err.message : 'Failed to resize field');
    }
  }

  async function updateFormFieldLabel(fieldId: string, label: string) {
    setFormFieldBusy(true);
    setFormFieldError(null);
    try {
      const res = await api.patch<{ formFields: PdfFormFieldTemplate[] }>(
        `/templates/${template._id}/form-fields/${fieldId}`,
        { label },
      );
      setFormFields(res.formFields);
    } catch (err) {
      setFormFieldError(err instanceof Error ? err.message : 'Failed to update field');
    } finally {
      setFormFieldBusy(false);
    }
  }

  async function updateFormFieldType(fieldId: string, type: PdfFormFieldType) {
    setFormFieldBusy(true);
    setFormFieldError(null);
    try {
      const res = await api.patch<{ formFields: PdfFormFieldTemplate[] }>(
        `/templates/${template._id}/form-fields/${fieldId}`,
        { type },
      );
      setFormFields(res.formFields);
    } catch (err) {
      setFormFieldError(err instanceof Error ? err.message : 'Failed to update field');
    } finally {
      setFormFieldBusy(false);
    }
  }

  async function deleteFormField(fieldId: string) {
    setFormFieldBusy(true);
    setFormFieldError(null);
    try {
      const res = await api.delete<{ formFields: PdfFormFieldTemplate[] }>(
        `/templates/${template._id}/form-fields/${fieldId}`,
      );
      setFormFields(res.formFields);
      setActiveFormFieldId(null);
    } catch (err) {
      setFormFieldError(err instanceof Error ? err.message : 'Failed to delete field');
    } finally {
      setFormFieldBusy(false);
    }
  }

  async function handleExtractFormFields() {
    setFormFieldBusy(true);
    setFormFieldError(null);
    try {
      const res = await api.post<{ fields: PdfFormFieldTemplate[] }>(
        `/templates/${template._id}/extract-form-fields`,
      );
      setFormFields(res.fields);
    } catch (err) {
      setFormFieldError(err instanceof Error ? err.message : 'Failed to extract form fields');
    } finally {
      setFormFieldBusy(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.patch(`/templates/${template._id}`, {
        name: name.trim() || template.name,
        isDefault,
        fields: fields.map((f) => ({
          label: f.label,
          pageNumber: f.pageNumber,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
        })),
      });
      await ensureSignerProfilesForRoles(
        api,
        template._id,
        uniqueFieldLabels(fields),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex w-full overflow-hidden">
      {/* PDF viewer — main area */}
      <div className="flex-1 overflow-y-auto bg-gray-100 p-4">
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setMode('signatures')}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
              mode === 'signatures'
                ? 'border-black bg-black text-white'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Signature fields
          </button>
          <button
            onClick={() => setMode('form-fields')}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
              mode === 'form-fields'
                ? 'border-black bg-black text-white'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Form fields
          </button>
        </div>
        {addMode && (
          <div className="mb-3 flex items-center gap-3 rounded-md bg-indigo-50 border border-indigo-200 px-4 py-2 text-sm text-indigo-700">
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Click anywhere on the PDF to place a field
            <button
              onClick={() => setAddMode(false)}
              className="ml-auto text-xs underline"
            >
              Cancel
            </button>
          </div>
        )}
        {template.fileUrl ? (
          <PDFViewer
            pdfUrl={template.fileUrl}
            templateEditMode={mode === 'signatures'}
            templateEditFields={mode === 'signatures' ? fields : undefined}
            selectedTemplateFieldId={mode === 'signatures' ? selectedId : null}
            onTemplateFieldSelect={mode === 'signatures' ? setSelectedId : undefined}
            onTemplateFieldAdd={mode === 'signatures' && addMode ? handleFieldAdd : undefined}
            onTemplateFieldMove={mode === 'signatures' ? handleFieldMove : undefined}
            onTemplateFieldResize={mode === 'signatures' ? handleFieldResize : undefined}
            formFields={mode === 'form-fields' ? formFields : undefined}
            formFieldPlacementMode={mode === 'form-fields' && formFieldPlacementMode}
            formFieldEditMode={mode === 'form-fields' && !formFieldPlacementMode}
            editableFormFieldIds={mode === 'form-fields' ? formFields.map((f) => f.id) : undefined}
            onFormFieldPlace={mode === 'form-fields' ? onFormFieldPlace : undefined}
            onFormFieldMove={mode === 'form-fields' ? onFormFieldMove : undefined}
            onFormFieldResize={mode === 'form-fields' ? onFormFieldResize : undefined}
            onFormFieldSelect={mode === 'form-fields' ? setActiveFormFieldId : undefined}
          />
        ) : (
          <div className="flex items-center justify-center py-32 text-sm text-gray-400">
            No PDF uploaded for this template.
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="w-72 shrink-0 overflow-y-auto border-l border-gray-200 bg-white">
        <div className="flex flex-col h-full p-4 gap-5">
          {/* Back */}
          <button
            onClick={() => router.push('/templates')}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-black"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to templates
          </button>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Template name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          {/* Default toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Set as default template</span>
          </label>

          <hr className="border-gray-200" />

          {mode === 'signatures' && (
            <>
              {/* Add field button */}
              <button
                onClick={() => { setAddMode((v) => !v); setSelectedId(null); }}
                className={`w-full rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  addMode
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                {addMode ? 'Click on PDF to place…' : '+ Add field'}
              </button>

              <button
                onClick={handleExtractFields}
                disabled={extracting || !template.fileUrl}
                className="w-full rounded-md border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50"
              >
                {extracting ? 'AI is extracting…' : 'AI extract fields'}
              </button>
              {extractError && (
                <p className="text-xs text-red-600">{extractError}</p>
              )}

              {/* Selected field properties */}
              {selectedField && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-2">
                  <p className="text-xs font-semibold text-blue-700">Selected field</p>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Label</label>
                    <input
                      type="text"
                      value={selectedField.label}
                      onChange={(e) => updateSelectedLabel(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                  <div className="text-xs text-gray-500">
                    Page {selectedField.pageNumber} · ({selectedField.x.toFixed(1)}%, {selectedField.y.toFixed(1)}%)
                  </div>
                  <div className="text-xs text-gray-500">
                    Size: {selectedField.width.toFixed(1)}% × {selectedField.height.toFixed(1)}%
                  </div>
                  <button
                    onClick={deleteSelected}
                    className="w-full rounded border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Remove field
                  </button>
                </div>
              )}

              {/* Fields list */}
              <div className="flex-1">
                <p className="mb-2 text-xs font-medium text-gray-700">
                  Fields ({fields.length})
                </p>
                {fields.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    No fields yet. Click &ldquo;+ Add field&rdquo; then click on the PDF.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {fields.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setSelectedId(f.id === selectedId ? null : f.id)}
                        className={`w-full rounded border px-3 py-2 text-left text-xs transition-colors ${
                          f.id === selectedId
                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <span className="font-medium">{f.label || 'Untitled'}</span>
                        <span className="ml-2 text-gray-400">p.{f.pageNumber}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {mode === 'form-fields' && (
            <>
              <button
                onClick={() => setFormFieldPlacementMode((v) => !v)}
                disabled={formFieldBusy}
                className={`w-full rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  formFieldPlacementMode
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                {formFieldPlacementMode ? 'Click on PDF to place…' : '+ Add form field'}
              </button>

              <button
                onClick={handleExtractFormFields}
                disabled={formFieldBusy}
                className="w-full rounded-md border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50"
              >
                {formFieldBusy ? 'AI is extracting…' : 'AI extract form fields'}
              </button>
              {formFieldError && <p className="text-xs text-red-600">{formFieldError}</p>}

              <div className="flex-1">
                <p className="mb-2 text-xs font-medium text-gray-700">
                  Form fields ({formFields.length})
                </p>
                {formFields.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    No form fields yet. Click &ldquo;+ Add form field&rdquo; then click on the PDF.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {formFields.map((f) => (
                      <div key={f.id}>
                        <button
                          onClick={() => setActiveFormFieldId(f.id === activeFormFieldId ? null : f.id)}
                          className={`w-full rounded border px-3 py-2 text-left text-xs transition-colors ${
                            f.id === activeFormFieldId
                              ? 'border-blue-300 bg-blue-50 text-blue-700'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <span className="font-medium">{f.label || 'Untitled'}</span>
                          <span className="ml-2 text-gray-400">p.{f.pageNumber}</span>
                        </button>
                        {f.id === activeFormFieldId && (
                          <div className="mt-1 space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3">
                            <input
                              type="text"
                              defaultValue={f.label}
                              disabled={formFieldBusy}
                              onBlur={(e) => {
                                const next = e.target.value.trim();
                                if (next && next !== f.label) void updateFormFieldLabel(f.id, next);
                              }}
                              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <select
                              value={f.type}
                              disabled={formFieldBusy}
                              onChange={(e) => void updateFormFieldType(f.id, e.target.value as PdfFormFieldType)}
                              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            >
                              <option value="text">Text</option>
                              <option value="textarea">Long text</option>
                              <option value="date">Date</option>
                            </select>
                            <button
                              onClick={() => void deleteFormField(f.id)}
                              disabled={formFieldBusy}
                              className="w-full rounded border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              Remove field
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Save */}
          <div className="space-y-2">
            {saveError && (
              <p className="text-xs text-red-600">{saveError}</p>
            )}
            {saved && (
              <p className="text-xs text-green-600">Saved!</p>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-gray-800"
            >
              {saving ? 'Saving…' : 'Save template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
