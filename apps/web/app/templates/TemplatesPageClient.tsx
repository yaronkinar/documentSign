'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import type { PdfTemplateDto } from '@docflow/shared';

import { useApiClient } from '@/lib/api-client';
import { isPdfFile, titleFromUploadFile } from '@/lib/document-upload';
import { getPdfPageCount } from '@/lib/pdf-page-count';

interface Props {
  initialTemplates: PdfTemplateDto[];
}

interface PendingTemplate {
  id: string;
  file: File;
  name: string;
}

function uniqueTemplateName(base: string, taken: Set<string>): string {
  const key = base.trim().toLowerCase();
  if (!key) return uniqueTemplateName('Untitled template', taken);
  if (!taken.has(key)) {
    taken.add(key);
    return base.trim();
  }
  let i = 2;
  while (taken.has(`${base.trim()} (${i})`.toLowerCase())) i += 1;
  const name = `${base.trim()} (${i})`;
  taken.add(name.toLowerCase());
  return name;
}

function takenTemplateNames(
  templates: PdfTemplateDto[],
  pending: PendingTemplate[],
  excludeId?: string,
): Set<string> {
  const taken = new Set(
    templates.map((t) => t.name.trim().toLowerCase()).filter(Boolean),
  );
  for (const item of pending) {
    if (item.id === excludeId) continue;
    const name = item.name.trim().toLowerCase();
    if (name) taken.add(name);
  }
  return taken;
}

export function TemplatesPageClient({ initialTemplates }: Props) {
  const router = useRouter();
  const api = useApiClient();
  const [templates, setTemplates] = useState<PdfTemplateDto[]>(initialTemplates);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<PendingTemplate[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  let nextPendingId = useRef(0);

  const addPdfFiles = useCallback(
    (files: FileList | File[]) => {
      const pdfs = [...files].filter(isPdfFile);
      if (pdfs.length === 0) {
        setError('Please choose PDF files only.');
        return;
      }
      setError(null);
      setPending((prev) => {
        const taken = takenTemplateNames(templates, prev);
        const added = pdfs.map((file) => {
          const base = titleFromUploadFile(file, 'Untitled template');
          return {
            id: `pending-${++nextPendingId.current}`,
            file,
            name: uniqueTemplateName(base, taken),
          };
        });
        return [...prev, ...added];
      });
    },
    [templates],
  );

  async function uploadOneTemplate(file: File, name: string): Promise<PdfTemplateDto> {
    const { uploadUrl, templateId } = await api.post<{
      uploadUrl: string;
      templateId: string;
      fileKey: string;
    }>('/templates', { name: name.trim() });

    const pageCount = await getPdfPageCount(file);

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'application/pdf' },
    });
    if (!uploadRes.ok) {
      throw new Error(`Upload failed for "${name}": ${uploadRes.status}`);
    }

    return api.post<PdfTemplateDto>(`/templates/${templateId}/confirm`, {
      fileSize: file.size,
      pageCount,
    });
  }

  async function handleCreateBatch(e: React.FormEvent) {
    e.preventDefault();
    if (pending.length === 0) return;
    const invalid = pending.find((item) => !item.name.trim());
    if (invalid) {
      setError('Every template needs a name.');
      return;
    }

    setError(null);
    setUploading(true);
    const created: PdfTemplateDto[] = [];
    const failures: string[] = [];

    for (let i = 0; i < pending.length; i += 1) {
      const item = pending[i]!;
      setUploadProgress(`Uploading ${i + 1} of ${pending.length}: ${item.name}`);
      try {
        created.push(await uploadOneTemplate(item.file, item.name));
      } catch (err) {
        failures.push(
          `${item.name}: ${err instanceof Error ? err.message : 'Upload failed'}`,
        );
      }
    }

    if (created.length > 0) {
      setTemplates((prev) => [...created, ...prev]);
    }

    setUploading(false);
    setUploadProgress(null);

    if (failures.length === 0) {
      setPending([]);
      setCreating(false);
      if (created.length === 1) {
        router.push(`/templates/${created[0]!._id}`);
      }
      return;
    }

    if (created.length > 0) {
      const failedNames = new Set(
        failures.map((f) => f.split(':')[0]?.trim().toLowerCase()),
      );
      setPending((prev) =>
        prev.filter((item) => failedNames.has(item.name.trim().toLowerCase())),
      );
      setError(
        `Created ${created.length} template(s). Failed: ${failures.join('; ')}`,
      );
      return;
    }

    setError(failures.join('; '));
  }

  function updatePendingName(id: string, name: string) {
    setPending((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name } : item)),
    );
  }

  function removePending(id: string) {
    setPending((prev) => prev.filter((item) => item.id !== id));
  }

  function closeCreatePanel() {
    if (uploading) return;
    setCreating(false);
    setPending([]);
    setError(null);
    setUploadProgress(null);
    setDragOver(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/templates/${id}`);
      setTemplates((prev) => prev.filter((t) => t._id !== id));
    } catch {
      alert('Failed to delete template');
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setError(null);
          }}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          New Templates
        </button>
      </div>

      {creating && (
        <div className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-5">
          <h2 className="mb-1 text-sm font-semibold">Upload PDF templates</h2>
          <p className="mb-4 text-xs text-gray-500">
            Select or drop multiple PDFs. Each file becomes its own template.
          </p>
          <form onSubmit={handleCreateBatch} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                PDF files
              </label>
              <div
                onClick={() => !uploading && fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!uploading) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (uploading) return;
                  if (e.dataTransfer.files.length > 0) {
                    addPdfFiles(e.dataTransfer.files);
                  }
                }}
                className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded border-2 border-dashed px-4 py-6 text-center transition-colors ${
                  dragOver
                    ? 'border-black bg-white'
                    : 'border-gray-300 hover:border-gray-400'
                } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
              >
                <span className="text-sm text-gray-600">
                  Click to browse or drag PDFs here
                </span>
                <span className="text-xs text-gray-400">Multiple files supported</span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) addPdfFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {pending.length > 0 && (
              <ul className="max-h-64 space-y-2 overflow-y-auto rounded border border-gray-200 bg-white p-2">
                {pending.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-gray-500">{item.file.name}</p>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updatePendingName(item.id, e.target.value)}
                        disabled={uploading}
                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:opacity-50"
                        required
                      />
                    </div>
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => removePending(item.id)}
                      className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {uploadProgress && (
              <p className="text-sm text-gray-600">{uploadProgress}</p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={uploading || pending.length === 0}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-gray-800"
              >
                {uploading
                  ? 'Uploading…'
                  : pending.length <= 1
                    ? 'Create & place fields'
                    : `Create ${pending.length} templates`}
              </button>
              <button
                type="button"
                onClick={closeCreatePanel}
                disabled={uploading}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {templates.length === 0 && !creating ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <p className="mb-3 text-sm text-gray-500">No templates yet.</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Upload your first templates
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div
              key={t._id}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  {t.isDefault && (
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Default
                    </span>
                  )}
                </div>
              </div>
              <div className="mb-4 space-y-0.5 text-xs text-gray-500">
                {t.pageCount != null && (
                  <p>
                    {t.pageCount} page{t.pageCount !== 1 ? 's' : ''}
                  </p>
                )}
                <p>
                  {t.fields.length} field{t.fields.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/templates/${t._id}`)}
                  className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                >
                  Edit fields
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(t._id, t.name)}
                  className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
