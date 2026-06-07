'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { PdfTemplateDto } from '@docflow/shared';

import { useApiClient } from '@/lib/api-client';
import { pdfjsLib } from '@/lib/pdfjs-client';

interface Props {
  initialTemplates: PdfTemplateDto[];
}

export function TemplatesPageClient({ initialTemplates }: Props) {
  const router = useRouter();
  const api = useApiClient();
  const [templates, setTemplates] = useState<PdfTemplateDto[]>(initialTemplates);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newFile) return;
    setError(null);
    setUploading(true);
    try {
      const { uploadUrl, templateId } = await api.post<{
        uploadUrl: string;
        templateId: string;
        fileKey: string;
      }>('/templates', { name: newName.trim() });

      // Read page count before upload
      let pageCount = 1;
      try {
        const buf = await newFile.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        pageCount = doc.numPages;
        await doc.destroy();
      } catch { /* best-effort */ }

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: newFile,
        headers: { 'Content-Type': 'application/pdf' },
      });
      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

      await api.post(`/templates/${templateId}/confirm`, {
        fileSize: newFile.size,
        pageCount,
      });

      router.push(`/templates/${templateId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
      setUploading(false);
    }
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
          onClick={() => { setCreating(true); setError(null); }}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          New Template
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-5">
          <h2 className="mb-4 text-sm font-semibold">New Template</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Template name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Employment contract"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                PDF file
              </label>
              <div
                onClick={() => fileRef.current?.click()}
                className="flex cursor-pointer items-center gap-3 rounded border-2 border-dashed border-gray-300 px-4 py-4 hover:border-gray-400"
              >
                <span className="text-sm text-gray-500">
                  {newFile ? newFile.name : 'Click to select a PDF'}
                </span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={uploading || !newName.trim() || !newFile}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-gray-800"
              >
                {uploading ? 'Uploading…' : 'Create & place fields'}
              </button>
              <button
                type="button"
                onClick={() => { setCreating(false); setNewName(''); setNewFile(null); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Template list */}
      {templates.length === 0 && !creating ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <p className="mb-3 text-sm text-gray-500">No templates yet.</p>
          <button
            onClick={() => setCreating(true)}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Create your first template
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
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-medium text-sm">{t.name}</span>
                  {t.isDefault && (
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Default
                    </span>
                  )}
                </div>
              </div>
              <div className="mb-4 text-xs text-gray-500 space-y-0.5">
                {t.pageCount != null && <p>{t.pageCount} page{t.pageCount !== 1 ? 's' : ''}</p>}
                <p>{t.fields.length} field{t.fields.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/templates/${t._id}`)}
                  className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                >
                  Edit fields
                </button>
                <button
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
