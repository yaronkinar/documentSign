'use client';

import { useAuth } from '@clerk/nextjs';
import { Download, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { DocumentDto } from '@docflow/shared';

import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiClient } from '@/lib/api-client';
import { useDateLocale, useTranslation } from '@/lib/i18n/LocaleProvider';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

function countSigners(doc: DocumentDto): number {
  return doc.workflowSteps.reduce((sum, s) => sum + s.signers.length, 0);
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DocumentDto | null>(null);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  async function runDeleteDocument(doc: DocumentDto) {
    setDeleteBusyId(doc._id);
    try {
      await api.delete(`/documents/${doc._id}`);
      setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(doc._id);
        return next;
      });
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('dashboard.deleteFailed'),
      );
    } finally {
      setDeleteBusyId(null);
      setConfirmDelete(null);
    }
  }

  async function downloadDocument(doc: DocumentDto) {
    setDownloadBusyId(doc._id);
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
      toast.error(
        err instanceof Error ? err.message : t('document.downloadFailed'),
      );
    } finally {
      setDownloadBusyId(null);
    }
  }

  async function runDeleteSelected() {
    const ids = [...selectedIds];
    setBatchDeleting(true);
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await api.delete(`/documents/${id}`);
        setDocuments((prev) => prev.filter((d) => d._id !== id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch {
        failed.push(id);
      }
    }
    setBatchDeleting(false);
    setConfirmBatchDelete(false);
    if (failed.length > 0) {
      toast.error(t('dashboard.batchDeleteFailed'));
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

  const selectableIds = useMemo(() => filtered.map((d) => d._id), [filtered]);
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
        <h1 className="text-2xl">{t('dashboard.title')}</h1>
      </header>

      <div className="mb-6">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">{t('dashboard.filterAll')}</TabsTrigger>
            <TabsTrigger value="mine">{t('dashboard.filterMine')}</TabsTrigger>
            <TabsTrigger value="pending">
              {t('dashboard.filterPending')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-md border border-border bg-surface-muted px-4 py-2 text-sm">
          <span className="text-fg">
            {t('dashboard.selected', { count: String(selectedIds.size) })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => setConfirmBatchDelete(true)}
            disabled={batchDeleting}
          >
            {batchDeleting
              ? t('dashboard.deletingSelected')
              : t('dashboard.deleteSelected')}
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-12 text-center text-sm text-fg-muted">
          {t('dashboard.noDocuments')}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex items-center gap-3 border-b border-border bg-surface-muted px-4 py-2">
            <Checkbox
              checked={allSelected}
              disabled={selectableIds.length === 0}
              onCheckedChange={toggleSelectAll}
              aria-label={t('dashboard.selectAll')}
            />
            <span className="text-xs text-fg-muted">
              {t('dashboard.selectAll')}
            </span>
          </div>

          <ul className="divide-y divide-border">
            {filtered.map((doc) => {
              const isSelected = selectedIds.has(doc._id);
              return (
                <li key={doc._id}>
                  <div
                    className={cn(
                      'flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-muted',
                      isSelected && 'bg-surface-muted',
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(doc._id)}
                      aria-label={`Select ${doc.title}`}
                    />
                    <Link
                      href={`/documents/${doc._id}`}
                      className="min-w-0 flex-1"
                    >
                      <div className="truncate font-medium text-fg">
                        {doc.title}
                      </div>
                      <div className="text-xs text-fg-muted">
                        {countSigners(doc)} {t('dashboard.signers')} ·{' '}
                        {t('dashboard.updated')}{' '}
                        {formatUpdatedAt(doc.updatedAt, dateLocale)}
                      </div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => downloadDocument(doc)}
                        disabled={downloadBusyId === doc._id}
                        aria-label={t('common.downloadPdf')}
                      >
                        <Download className="me-1.5 h-3.5 w-3.5" />
                        {downloadBusyId === doc._id
                          ? t('common.downloading')
                          : t('common.downloadPdf')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDelete(doc)}
                        disabled={deleteBusyId === doc._id}
                        aria-label={t('common.delete')}
                        className="text-danger hover:bg-surface-muted hover:text-danger"
                      >
                        <Trash2 className="me-1.5 h-3.5 w-3.5" />
                        {deleteBusyId === doc._id
                          ? t('common.deleting')
                          : t('common.delete')}
                      </Button>
                      <StatusBadge status={doc.status} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.delete')}</DialogTitle>
            <DialogDescription>
              {confirmDelete
                ? t('dashboard.deleteConfirm', { title: confirmDelete.title })
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={deleteBusyId !== null}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && runDeleteDocument(confirmDelete)}
              disabled={deleteBusyId !== null}
            >
              {deleteBusyId
                ? t('common.deleting')
                : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmBatchDelete}
        onOpenChange={setConfirmBatchDelete}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dashboard.deleteSelected')}</DialogTitle>
            <DialogDescription>
              {t('dashboard.batchDeleteConfirm', {
                count: String(selectedIds.size),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmBatchDelete(false)}
              disabled={batchDeleting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={runDeleteSelected}
              disabled={batchDeleting}
            >
              {batchDeleting
                ? t('dashboard.deletingSelected')
                : t('dashboard.deleteSelected')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
