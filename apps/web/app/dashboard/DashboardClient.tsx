'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import type { DocumentDto } from '@docflow/shared';

import { StatusBadge } from '@/components/StatusBadge';
import { useApiClient } from '@/lib/api-client';
import { useDateLocale, useTranslation } from '@/lib/i18n/LocaleProvider';

type Filter = 'all' | 'mine' | 'pending';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const CLIENT_BYPASS_TOKEN =
  process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true'
    ? (process.env.NEXT_PUBLIC_BYPASS_TOKEN ?? null)
    : null;

function formatUpdatedAt(iso: string, dateLocale: string) {
  return new Date(iso).toLocaleDateString(dateLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function safePdfFileName(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return cleaned || 'document';
}

export function DashboardClient({
  documents: initialDocuments,
  myClerkId,
  myEmail,
}: {
  documents: DocumentDto[];
  myClerkId: string;
  myEmail: string;
}) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const { getToken } = useAuth();
  const api = useApiClient();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [documents, setDocuments] = useState(initialDocuments);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  async function deleteDocument(doc: DocumentDto) {
    if (!window.confirm(t('dashboard.deleteConfirm', { title: doc.title }))) return;
    setDeleteBusyId(doc._id);
    setError(null);
    try {
      await api.delete(`/documents/${doc._id}`);
      setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(doc._id); return next; });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('dashboard.deleteFailed'));
    } finally {
      setDeleteBusyId(null);
    }
  }

  async function downloadDocument(doc: DocumentDto) {
    setDownloadBusyId(doc._id);
    setError(null);
    try {
      const token = CLIENT_BYPASS_TOKEN ?? (await getToken());
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_URL}/documents/${doc._id}/download.pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      if (blob.size === 0) throw new Error('Downloaded PDF is empty');

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `${safePdfFileName(doc.title)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.downloadFailed'));
    } finally {
      setDownloadBusyId(null);
    }
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (!window.confirm(t('dashboard.batchDeleteConfirm', { count: String(ids.length) }))) return;
    setBatchDeleting(true);
    setError(null);
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await api.delete(`/documents/${id}`);
        setDocuments((prev) => prev.filter((d) => d._id !== id));
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      } catch {
        failed.push(id);
      }
    }
    setBatchDeleting(false);
    if (failed.length > 0) {
      setError(t('dashboard.batchDeleteFailed'));
    } else {
      router.refresh();
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'mine') {
      return documents.filter((d) => d.ownerId === myClerkId);
    }
    if (filter === 'pending') {
      return documents.filter((d) => {
        const activeStep = d.workflowSteps.find(
          (s) => s.stepNumber === d.currentStep,
        );
        if (!activeStep) return false;
        return activeStep.signers.some(
          (s) =>
            s.status === 'pending' &&
            (s.clerkId === myClerkId || s.email === myEmail),
        );
      });
    }
    return documents;
  }, [documents, filter, myClerkId, myEmail]);

  const selectableIds = useMemo(
    () => filtered.map((d) => d._id),
    [filtered],
  );

  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{t('dashboard.title')}</h1>
      </header>
      <div className="mb-6 flex gap-2 text-sm">
        <FilterTab
          label={t('dashboard.filterAll')}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <FilterTab
          label={t('dashboard.filterMine')}
          active={filter === 'mine'}
          onClick={() => setFilter('mine')}
        />
        <FilterTab
          label={t('dashboard.filterPending')}
          active={filter === 'pending'}
          onClick={() => setFilter('pending')}
        />
      </div>
      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded border border-blue-200 bg-blue-50 px-4 py-2 text-sm">
          <span className="text-blue-700">
            {t('dashboard.selected', { count: String(selectedIds.size) })}
          </span>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={batchDeleting}
            className="rounded px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
          >
            {batchDeleting ? t('dashboard.deletingSelected') : t('dashboard.deleteSelected')}
          </button>
        </div>
      )}
      {filtered.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
          {t('dashboard.noDocuments')}
        </p>
      ) : (
        <ul className="divide-y rounded border">
          <li className="border-b bg-gray-50 px-4 py-2">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={allSelected}
                disabled={selectableIds.length === 0}
                onChange={toggleSelectAll}
                aria-label={t('dashboard.selectAll')}
              />
              <span className="text-xs text-gray-500">{t('dashboard.selectAll')}</span>
            </div>
          </li>
          {filtered.map((doc) => {
            const canDelete = true;
            const isSelected = selectedIds.has(doc._id);
            return (
              <li key={doc._id}>
                <div
                  className={`flex items-center gap-4 px-4 py-3 hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 rounded border-gray-300"
                    checked={isSelected}
                    disabled={!canDelete}
                    onChange={() => toggleSelect(doc._id)}
                    aria-label={`Select ${doc.title}`}
                  />
                  <Link href={`/documents/${doc._id}`} className="min-w-0 flex-1">
                    <div className="truncate font-medium">{doc.title}</div>
                    <div className="text-xs text-gray-500">
                      {countSigners(doc)} {t('dashboard.signers')} ·{' '}
                      {t('dashboard.updated')}{' '}
                      {formatUpdatedAt(doc.updatedAt, dateLocale)}
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => downloadDocument(doc)}
                      disabled={downloadBusyId === doc._id}
                      className="rounded px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                      aria-label={t('common.downloadPdf')}
                    >
                      {downloadBusyId === doc._id
                        ? t('common.downloading')
                        : t('common.downloadPdf')}
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => deleteDocument(doc)}
                        disabled={deleteBusyId === doc._id}
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        aria-label={t('common.delete')}
                      >
                        {deleteBusyId === doc._id
                          ? t('common.deleting')
                          : t('common.delete')}
                      </button>
                    )}
                    <StatusBadge status={doc.status} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function FilterTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 ${
        active ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
}

function countSigners(doc: DocumentDto): number {
  return doc.workflowSteps.reduce((sum, s) => sum + s.signers.length, 0);
}
