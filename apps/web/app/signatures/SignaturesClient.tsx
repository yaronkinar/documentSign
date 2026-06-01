'use client';

import { useEffect, useRef, useState } from 'react';
import type { SavedSignatureDto } from '@docflow/shared';

import { useApiClient } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

type DrawMode = 'draw' | 'upload';

export function SignaturesClient() {
  const api = useApiClient();
  const { t } = useTranslation();
  const [signatures, setSignatures] = useState<SavedSignatureDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<DrawMode>('draw');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const sigs = await api.get<SavedSignatureDto[]>('/users/me/signatures');
      setSignatures(sigs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadAndSave(blob: Blob, type: 'drawn' | 'uploaded') {
    const resolvedLabel =
      label.trim() ||
      t('signatures.autoLabel', { n: signatures.length + 1 });
    setBusy(true);
    setError(null);
    try {
      const { uploadUrl, imageKey } = await api.post<{ uploadUrl: string; imageKey: string }>(
        '/users/me/signatures/upload-url',
        { type },
      );
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: blob,
      });
      if (!res.ok) throw new Error(`Storage upload failed (${res.status})`);
      await api.post('/users/me/signatures/confirm', {
        imageKey,
        label: resolvedLabel,
        type,
        setDefault: signatures.length === 0,
      });
      setLabel('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signatures.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function deleteSignature(id: string) {
    if (!confirm(t('signatures.deleteConfirm'))) return;
    try {
      await api.delete(`/users/me/signatures/${id}`);
      await refresh();
    } catch {
      setError(t('signatures.deleteFailed'));
    }
  }

  async function setDefaultSignature(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/users/me/signatures/${id}/default`);
      setSignatures((prev) =>
        prev.map((s) => ({ ...s, isDefault: s._id === id })),
      );
      await refresh();
    } catch {
      setError(t('signatures.switchFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">{t('signatures.title')}</h1>

      {/* ── New signature card ── */}
      <div className="rounded-lg border border-gray-200 p-6">
        <h2 className="mb-4 text-base font-medium">{t('signatures.addNew')}</h2>

        {/* Tab selector */}
        <div className="mb-4 flex gap-1 text-sm">
          {(['draw', 'upload'] as DrawMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded px-3 py-1.5 font-medium transition-colors ${
                mode === m ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {m === 'draw' ? t('signatures.draw') : t('signatures.upload')}
            </button>
          ))}
        </div>

        {mode === 'draw' ? (
          <DrawPanel busy={busy} onSave={uploadAndSave} />
        ) : (
          <UploadPanel busy={busy} onSave={uploadAndSave} />
        )}

        {/* Label + save row shared by both panels */}
        <div className="mt-4 flex items-center gap-3">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('signatures.labelPlaceholder')}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <span className="text-xs text-gray-500">
            {t('signatures.dateSaved', { date: new Date().toLocaleDateString() })}
          </span>
        </div>

        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
        {success && (
          <p className="mt-2 text-sm text-green-600">{t('signatures.saved')}</p>
        )}
      </div>

      {/* ── Saved signatures list ── */}
      <div>
        <h2 className="mb-3 text-base font-medium">{t('signatures.saved')}</h2>
        {loading ? (
          <p className="text-sm text-gray-500">{t('common.saving')}…</p>
        ) : signatures.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-400">
            {t('signatures.none')}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {signatures.map((s) => (
              <li key={s._id} className="group relative rounded-lg border border-gray-200 p-3">
                {s.isDefault && (
                  <span className="absolute right-2 top-2 rounded bg-black px-1.5 py-0.5 text-[10px] text-white">
                    {t('signatures.default')}
                  </span>
                )}
                <img
                  src={s.imageUrl}
                  alt={s.label}
                  className="h-20 w-full object-contain"
                />
                <p className="mt-1 truncate text-xs font-medium">{s.label}</p>
                <p className="text-[11px] text-gray-400">
                  {new Date(s.createdAt).toLocaleDateString()}
                </p>
                {signatures.length > 1 && !s.isDefault && (
                  <button
                    type="button"
                    onClick={() => setDefaultSignature(s._id)}
                    disabled={busy}
                    className="mt-2 w-full rounded border border-gray-200 py-1 text-xs text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    {t('signatures.useAsDefault')}
                  </button>
                )}
                <button
                  onClick={() => deleteSignature(s._id)}
                  className="mt-2 w-full rounded border border-red-200 py-1 text-xs text-red-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50"
                >
                  {t('common.delete')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────── */

function DrawPanel({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (blob: Blob, type: 'drawn') => void;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
  }, []);

  function clear() {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
  }

  function down(e: React.MouseEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    const r = c.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
  }
  function move(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    const r = c.getBoundingClientRect();
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
    ctx.stroke();
  }
  function up() { drawing.current = false; }

  async function save() {
    const c = canvasRef.current;
    if (!c) return;
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (blob) onSave(blob, 'drawn');
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={560}
        height={180}
        className="block w-full rounded border border-gray-300 bg-white touch-none"
        onMouseDown={down}
        onMouseMove={move}
        onMouseUp={up}
        onMouseLeave={up}
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={clear}
          className="rounded border border-gray-200 px-3 py-1 text-sm hover:bg-gray-50"
        >
          {t('signaturePad.clear')}
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="rounded bg-black px-4 py-1 text-sm text-white disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('signatures.saveSignature')}
        </button>
      </div>
    </div>
  );
}

function UploadPanel({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (blob: Blob, type: 'uploaded') => void;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBlob(file);
    setPreview(URL.createObjectURL(file));
  }

  return (
    <div className="space-y-3">
      <div
        className="flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-gray-300 p-8 text-sm text-gray-500 hover:border-gray-400 hover:bg-gray-50"
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          <img src={preview} className="max-h-32 object-contain" alt="preview" />
        ) : (
          <>
            <span className="text-3xl">↑</span>
            <span className="mt-1">{t('signatures.clickToUpload')}</span>
            <span className="text-xs text-gray-400">{t('signatures.uploadHint')}</span>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
      {blob && (
        <button
          onClick={() => onSave(blob, 'uploaded')}
          disabled={busy}
          className="rounded bg-black px-4 py-1 text-sm text-white disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('signatures.saveSignature')}
        </button>
      )}
    </div>
  );
}
