'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserNotificationDto } from '@docflow/shared';

import { useApiClient } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { useUserSocket } from '@/lib/user-socket';

function formatRelativeTime(iso: string, locale: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return locale === 'he' ? 'עכשיו' : 'Just now';
  if (diffMin < 60) return locale === 'he' ? `לפני ${diffMin} דק׳` : `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return locale === 'he' ? `לפני ${diffHours} ש׳` : `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return locale === 'he' ? `לפני ${diffDays} ימים` : `${diffDays}d ago`;
}

function notificationMessage(
  n: UserNotificationDto,
  t: (key: string, vars?: Record<string, string>) => string,
): string {
  const author = n.authorName?.trim() || n.authorEmail;
  if (n.type === 'comment_reply') {
    return t('notifications.repliedOn', {
      author,
      document: n.documentTitle,
    });
  }
  return t('notifications.commentedOn', {
    author,
    document: n.documentTitle,
  });
}

export function NotificationBell() {
  const { userId } = useAuth();
  const api = useApiClient();
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserNotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [list, countRes] = await Promise.all([
        api.get<UserNotificationDto[]>('/user-notifications', { limit: 30 }),
        api.get<{ count: number }>('/user-notifications/unread-count'),
      ]);
      setItems(list);
      setUnreadCount(countRes.count);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [api, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useUserSocket(userId ?? null, {
    'notification:new': ({ notification }) => {
      setItems((prev) => {
        const without = prev.filter((n) => n._id !== notification._id);
        return [notification, ...without].slice(0, 30);
      });
      if (!notification.read) {
        setUnreadCount((c) => c + 1);
      }
    },
  });

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  async function handleOpen() {
    const next = !open;
    setOpen(next);
    if (next) await refresh();
  }

  async function handleClick(notification: UserNotificationDto) {
    if (!notification.read) {
      try {
        const updated = await api.patch<UserNotificationDto>(
          `/user-notifications/${notification._id}/read`,
        );
        setItems((prev) =>
          prev.map((n) => (n._id === updated._id ? updated : n)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
      }
    }
    setOpen(false);
    router.push(`/documents/${notification.documentId}`);
  }

  async function handleMarkAllRead() {
    try {
      await api.patch('/user-notifications/read-all');
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }

  if (!userId) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => void handleOpen()}
        className="relative rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-50 hover:text-black"
        aria-label={t('notifications.title')}
        aria-expanded={open}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="h-5 w-5"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute end-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border bg-white shadow-lg sm:w-96">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">{t('notifications.title')}</h2>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                {t('notifications.markAllRead')}
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">
                {t('notifications.loading')}
              </p>
            ) : null}
            {!loading && items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">
                {t('notifications.empty')}
              </p>
            ) : null}
            {items.map((notification) => (
              <button
                key={notification._id}
                type="button"
                onClick={() => void handleClick(notification)}
                className={`block w-full border-b px-4 py-3 text-start transition-colors hover:bg-gray-50 ${
                  notification.read ? 'bg-white' : 'bg-blue-50/60'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">
                  {notificationMessage(notification, t)}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-gray-600">
                  {notification.contentPreview}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {formatRelativeTime(notification.createdAt, locale)}
                </p>
              </button>
            ))}
          </div>

          {items.length > 0 ? (
            <div className="border-t px-4 py-2 text-center">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-gray-600 hover:text-black"
              >
                {t('notifications.viewDocuments')}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
