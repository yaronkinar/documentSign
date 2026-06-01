'use client';

import { useEffect, useRef, useState } from 'react';
import type { SignerProfileDto } from '@docflow/shared';
import { MUNICIPAL_APPROVAL_SIGNER_TITLES } from '@docflow/shared';

import { useApiClient } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

export function UsersClient() {
  const api = useApiClient();
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<SignerProfileDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const list = await api.get<SignerProfileDto[]>('/signer-profiles');
      setProfiles(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createProfile() {
    const resolvedTitle =
      title === '__custom__' ? customTitle.trim() : title.trim();
    if (!resolvedTitle || !name.trim()) {
      setError(t('users.titleNameRequired'));
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await api.post<SignerProfileDto>('/signer-profiles', {
        title: resolvedTitle,
        name: name.trim(),
        email: email.trim() || undefined,
      });
      setProfiles((prev) =>
        [...prev, created].sort((a, b) =>
          a.title.localeCompare(b.title, 'he'),
        ),
      );
      setTitle('');
      setCustomTitle('');
      setName('');
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.createFailed'));
    } finally {
      setCreating(false);
    }
  }

  async function updateProfile(
    id: string,
    patch: { title?: string; name?: string; email?: string | null },
  ) {
    setBusyId(id);
    setError(null);
    try {
      const updated = await api.patch<SignerProfileDto>(
        `/signer-profiles/${id}`,
        patch,
      );
      setProfiles((prev) =>
        prev
          .map((p) => (p._id === id ? updated : p))
          .sort((a, b) => a.title.localeCompare(b.title, 'he')),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.updateFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProfile(id: string) {
    if (!confirm(t('users.deleteConfirm'))) return;
    setBusyId(id);
    setError(null);
    try {
      await api.delete(`/signer-profiles/${id}`);
      setProfiles((prev) => prev.filter((p) => p._id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.deleteFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function uploadSignature(id: string, file: File) {
    setBusyId(id);
    setError(null);
    try {
      const { uploadUrl, imageKey } = await api.post<{
        uploadUrl: string;
        imageKey: string;
      }>(`/signer-profiles/${id}/signature/upload-url`);
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/png' },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const updated = await api.post<SignerProfileDto>(
        `/signer-profiles/${id}/signature/confirm`,
        { imageKey },
      );
      setProfiles((prev) => prev.map((p) => (p._id === id ? updated : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.uploadFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function removeSignature(id: string) {
    if (!confirm(t('users.removeSignatureConfirm'))) return;
    setBusyId(id);
    setError(null);
    try {
      const result = await api.delete<SignerProfileDto>(
        `/signer-profiles/${id}/signature`,
      );
      setProfiles((prev) => prev.map((p) => (p._id === id ? result : p)));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('users.removeSignatureFailed'),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function addAllApprovalRoles() {
    const usedTitles = new Set(profiles.map((p) => p.title));
    const missing = MUNICIPAL_APPROVAL_SIGNER_TITLES.filter(
      (role) => !usedTitles.has(role),
    );
    if (missing.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      const created = await Promise.all(
        missing.map((role) =>
          api.post<SignerProfileDto>('/signer-profiles', {
            title: role,
            name: '—',
          }),
        ),
      );
      setProfiles((prev) =>
        [...prev, ...created].sort((a, b) =>
          a.title.localeCompare(b.title, 'he'),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.createFailed'));
    } finally {
      setCreating(false);
    }
  }

  const usedTitles = new Set(profiles.map((p) => p.title));
  const pendingRoles = MUNICIPAL_APPROVAL_SIGNER_TITLES.filter(
    (role) => !usedTitles.has(role),
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('users.title')}</h1>
        <p className="mt-1 text-sm text-gray-600">{t('users.subtitle')}</p>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 p-6">
        <h2 className="mb-4 text-base font-medium">{t('users.addUser')}</h2>
        <div className="flex flex-wrap gap-2">
          <select
            className="min-w-56 flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          >
            <option value="">{t('newDocument.selectRolePlaceholder')}</option>
            {MUNICIPAL_APPROVAL_SIGNER_TITLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
            <option value="__custom__">{t('newDocument.customRole')}</option>
          </select>
          {title === '__custom__' && (
            <input
              type="text"
              placeholder={t('users.customTitlePlaceholder')}
              className="w-48 rounded border border-gray-300 px-3 py-2 text-sm"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
            />
          )}
          <input
            type="text"
            placeholder={t('users.namePlaceholder')}
            className="w-40 rounded border border-gray-300 px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="email"
            placeholder={t('newDocument.emailPlaceholder')}
            className="min-w-48 flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            onClick={createProfile}
            disabled={creating}
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {creating ? t('common.saving') : t('common.add')}
          </button>
        </div>
        {pendingRoles.length > 0 && (
          <button
            type="button"
            onClick={addAllApprovalRoles}
            disabled={creating}
            className="mt-3 text-xs text-blue-700 hover:underline disabled:opacity-50"
          >
            {t('newDocument.addAllApprovals')} ({pendingRoles.length})
          </button>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-base font-medium">{t('users.directory')}</h2>
        {loading ? (
          <p className="text-sm text-gray-500">{t('common.saving')}…</p>
        ) : profiles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-400">
            {t('users.none')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-start">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('users.colTitle')}</th>
                  <th className="px-4 py-3 font-medium">{t('users.colName')}</th>
                  <th className="px-4 py-3 font-medium">{t('users.colEmail')}</th>
                  <th className="px-4 py-3 font-medium">{t('users.colSignature')}</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {profiles.map((profile) => (
                  <ProfileRow
                    key={profile._id}
                    profile={profile}
                    busy={busyId === profile._id}
                    onUpdate={updateProfile}
                    onDelete={deleteProfile}
                    onUpload={uploadSignature}
                    onRemoveSignature={removeSignature}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileRow({
  profile,
  busy,
  onUpdate,
  onDelete,
  onUpload,
  onRemoveSignature,
}: {
  profile: SignerProfileDto;
  busy: boolean;
  onUpdate: (
    id: string,
    patch: { title?: string; name?: string; email?: string | null },
  ) => void;
  onDelete: (id: string) => void;
  onUpload: (id: string, file: File) => void;
  onRemoveSignature: (id: string) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email ?? '');

  useEffect(() => {
    setName(profile.name);
    setEmail(profile.email ?? '');
  }, [profile.name, profile.email]);

  function saveField(field: 'name' | 'email') {
    if (field === 'name' && name.trim() === profile.name) return;
    if (field === 'email' && email.trim() === (profile.email ?? '')) return;
    onUpdate(profile._id, {
      [field]: field === 'email' ? email.trim() || null : name.trim(),
    });
  }

  return (
    <tr className={busy ? 'opacity-60' : undefined}>
      <td className="px-4 py-3 align-top font-medium text-gray-800">
        {profile.title}
      </td>
      <td className="px-4 py-3 align-top">
        <input
          type="text"
          className="w-full min-w-32 rounded border border-gray-300 px-2 py-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => saveField('name')}
        />
      </td>
      <td className="px-4 py-3 align-top">
        <input
          type="email"
          className="w-full min-w-40 rounded border border-gray-300 px-2 py-1"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => saveField('email')}
          placeholder={t('newDocument.emailPlaceholder')}
        />
      </td>
      <td className="px-4 py-3 align-top">
        {profile.signatureImageUrl ? (
          <div className="space-y-2">
            <img
              src={profile.signatureImageUrl}
              alt={`${profile.name} signature`}
              className="h-14 max-w-[160px] object-contain"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="text-xs text-blue-700 hover:underline"
              >
                {t('users.replaceSignature')}
              </button>
              <button
                type="button"
                onClick={() => onRemoveSignature(profile._id)}
                disabled={busy}
                className="text-xs text-red-600 hover:underline"
              >
                {t('users.removeSignature')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
          >
            {t('users.uploadSignature')}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(profile._id, file);
            e.target.value = '';
          }}
        />
      </td>
      <td className="px-4 py-3 align-top text-end">
        <button
          type="button"
          onClick={() => onDelete(profile._id)}
          disabled={busy}
          className="text-xs text-red-600 hover:underline"
        >
          {t('common.delete')}
        </button>
      </td>
    </tr>
  );
}
