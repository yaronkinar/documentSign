'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PdfFormFieldTemplate } from '@docflow/shared';

const SECTION_LABELS: Record<string, string> = {
  header: 'כותרת',
  contract_types: 'סוגי חוזים',
  details: 'פרטי החוזה',
  budget: 'תקציב',
  amounts: 'סכומים ואישורים',
  general: 'שדות',
};

function sectionLabel(section: string): string {
  if (SECTION_LABELS[section]) return SECTION_LABELS[section];
  const pageMatch = /^page_(\d+)$/.exec(section);
  if (pageMatch) return `עמוד ${pageMatch[1]}`;
  return section;
}

interface Props {
  fields: PdfFormFieldTemplate[];
  values: Record<string, string>;
  readOnly?: boolean;
  saving?: boolean;
  hideSaveButton?: boolean;
  onChange?: (values: Record<string, string>) => void;
  onSave: (values: Record<string, string>) => Promise<void>;
}

export function DocumentFormFillPanel({
  fields,
  values,
  readOnly = false,
  saving = false,
  hideSaveButton = false,
  onChange,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<Record<string, string>>(values);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(values);
  }, [values]);

  const sections = useMemo(() => {
    const grouped = new Map<string, PdfFormFieldTemplate[]>();
    for (const field of fields) {
      const list = grouped.get(field.section) ?? [];
      list.push(field);
      grouped.set(field.section, list);
    }
    return [...grouped.entries()];
  }, [fields]);

  async function handleSave() {
    setError(null);
    try {
      await onSave(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save form');
    }
  }

  function updateField(id: string, value: string) {
    setDraft((prev) => {
      const next = { ...prev, [id]: value };
      onChange?.(next);
      return next;
    });
  }

  return (
    <div className="space-y-4 text-sm">
      {sections.map(([section, sectionFields]) => (
        <div key={section}>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-gray-500">
            {sectionLabel(section)}
          </h3>
          <div className="space-y-3">
            {sectionFields.map((field) => (
              <label key={field.id} className="block">
                <span className="text-xs font-medium text-gray-700">{field.label}</span>
                {field.type === 'textarea' ? (
                  <textarea
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    rows={3}
                    value={draft[field.id] ?? ''}
                    disabled={readOnly || saving}
                    onChange={(e) => updateField(field.id, e.target.value)}
                  />
                ) : (
                  <input
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    type={field.type === 'date' ? 'date' : 'text'}
                    value={draft[field.id] ?? ''}
                    disabled={readOnly || saving}
                    onChange={(e) => updateField(field.id, e.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      ))}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {!readOnly && !hideSaveButton && (
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full rounded bg-black px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? 'שומר…' : 'שמור טופס'}
        </button>
      )}
    </div>
  );
}
