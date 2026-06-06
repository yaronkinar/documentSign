'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { PdfTemplateDto } from '@docflow/shared';

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
            templateEditMode
            templateEditFields={fields}
            selectedTemplateFieldId={selectedId}
            onTemplateFieldSelect={setSelectedId}
            onTemplateFieldAdd={addMode ? handleFieldAdd : undefined}
            onTemplateFieldMove={handleFieldMove}
            onTemplateFieldResize={handleFieldResize}
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
