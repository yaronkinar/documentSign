'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import type { PdfTemplateDto } from '@docflow/shared';

import { useApiClient } from '@/lib/api-client';
import { isPdfFile, titleFromUploadFile } from '@/lib/document-upload';
import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { getPdfPageCount } from '@/lib/pdf-page-count';

interface Props {
  initialTemplates: PdfTemplateDto[];
}

interface PendingTemplate {
  id: string;
  file: File;
  name: string;
}

function uniqueTemplateName(base: string, taken: Set<string>, fallback: string): string {
  const key = base.trim().toLowerCase();
  if (!key) return uniqueTemplateName(fallback, taken, fallback);
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
  const { t } = useTranslation();
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
        setError(t('templates.pdfOnly'));
        return;
      }
      setError(null);
      const untitled = t('templates.untitled');
      setPending((prev) => {
        const taken = takenTemplateNames(templates, prev);
        const added = pdfs.map((file) => {
          const base = titleFromUploadFile(file, untitled);
          return {
            id: `pending-${++nextPendingId.current}`,
            file,
            name: uniqueTemplateName(base, taken, untitled),
          };
        });
        return [...prev, ...added];
      });
    },
    [templates, t],
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
      throw new Error(
        t('templates.uploadFailedFor', { name, status: uploadRes.status }),
      );
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
      setError(t('templates.nameRequired'));
      return;
    }

    setError(null);
    setUploading(true);
    const created: PdfTemplateDto[] = [];
    const failures: string[] = [];

    for (let i = 0; i < pending.length; i += 1) {
      const item = pending[i]!;
      setUploadProgress(
        t('templates.uploadingProgress', {
          current: i + 1,
          total: pending.length,
          name: item.name,
        }),
      );
      try {
        created.push(await uploadOneTemplate(item.file, item.name));
      } catch (err) {
        failures.push(
          `${item.name}: ${
            err instanceof Error ? err.message : t('templates.uploadFailed')
          }`,
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
        t('templates.createdWithFailures', {
          count: created.length,
          failures: failures.join('; '),
        }),
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
    if (!confirm(t('templates.confirmDelete', { name }))) return;
    try {
      await api.delete(`/templates/${id}`);
      setTemplates((prev) => prev.filter((item) => item._id !== id));
    } catch {
      alert(t('templates.deleteFailed'));
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('templates.title')}</h1>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setError(null);
          }}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          {t('templates.newTemplates')}
        </button>
      </div>

      {creating && (
        <div className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-5">
          <h2 className="mb-1 text-sm font-semibold">{t('templates.uploadTitle')}</h2>
          <p className="mb-4 text-xs text-gray-500">
            {t('templates.uploadSubtitle')}
          </p>
          <form onSubmit={handleCreateBatch} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t('templates.pdfFilesLabel')}
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
                  {t('templates.dropzone')}
                </span>
                <span className="text-xs text-gray-400">
                  {t('templates.dropzoneHint')}
                </span>
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
                      {t('common.remove')}
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
                  ? t('common.uploading')
                  : pending.length <= 1
                    ? t('templates.createAndPlace')
                    : t('templates.createMany', { count: pending.length })}
              </button>
              <button
                type="button"
                onClick={closeCreatePanel}
                disabled={uploading}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {templates.length === 0 && !creating ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <p className="mb-3 text-sm text-gray-500">{t('templates.emptyTitle')}</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            {t('templates.uploadFirst')}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl) => (
            <div
              key={tpl._id}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{tpl.name}</span>
                  {tpl.isDefault && (
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      {t('templates.defaultBadge')}
                    </span>
                  )}
                </div>
              </div>
              <div className="mb-4 space-y-0.5 text-xs text-gray-500">
                {tpl.pageCount != null && (
                  <p>
                    {tpl.pageCount === 1
                      ? t('templates.pageOne')
                      : t('templates.pageCount', { count: tpl.pageCount })}
                  </p>
                )}
                <p>
                  {tpl.fields.length === 1
                    ? t('templates.fieldOne')
                    : t('templates.fieldCount', { count: tpl.fields.length })}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/templates/${tpl._id}`)}
                  className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                >
                  {t('templates.editFields')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(tpl._id, tpl.name)}
                  className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
