'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import type { DocumentDto } from '@docflow/shared';

import { StatusBadge } from '@/components/StatusBadge';
import { useApiClient } from '@/lib/api-client';
import { useDateLocale, useTranslation } from '@/lib/i18n/LocaleProvider';

type Filter = 'all' | 'mine' | 'pending';

function formatUpdatedAt(iso: string, dateLocale: string) {
  return new Date(iso).toLocaleDateString(dateLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
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
  const api = useApiClient();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [documents, setDocuments] = useState(initialDocuments);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('dashboard.deleteFailed'));
    } finally {
      setDeleteBusyId(null);
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
      {filtered.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
          {t('dashboard.noDocuments')}
        </p>
      ) : (
        <ul className="divide-y rounded border">
          {filtered.map((doc) => {
            const canDelete = doc.ownerId === myClerkId;
            return (
            <li key={doc._id}>
              <div className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50">
                <Link
                  href={`/documents/${doc._id}`}
                  className="min-w-0 flex-1"
                >
                  <div className="truncate font-medium">{doc.title}</div>
                  <div className="text-xs text-gray-500">
                    {countSigners(doc)} {t('dashboard.signers')} ·{' '}
                    {t('dashboard.updated')}{' '}
                    {formatUpdatedAt(doc.updatedAt, dateLocale)}
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-3">
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
