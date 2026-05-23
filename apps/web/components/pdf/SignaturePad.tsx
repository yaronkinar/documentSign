'use client';

import { useEffect, useRef, useState } from 'react';
import type { SavedSignatureDto } from '@docflow/shared';

import { apiClient, useApiClient } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

export interface SignaturePadProps {
  mode: 'guest' | 'registered';
  /** Required when mode === 'guest' - used for /storage/upload-url/guest */
  inviteToken?: string;
  /** Required when mode === 'guest' - to satisfy InviteGuard query param */
  documentId?: string;
  /** Upload handler for registered users placing a signature on a document */
  uploadBlob?: (blob: Blob) => Promise<string>;
  /** Available when mode === 'registered' */
  savedSignatures?: SavedSignatureDto[];
  onComplete: (imageKey: string, savedSignatureId?: string) => void;
  onClose: () => void;
}

type Tab = 'draw' | 'type' | 'upload' | 'library';

export function SignaturePad(props: SignaturePadProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('draw');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tabs: Tab[] =
    props.mode === 'registered' ? ['draw', 'type', 'upload', 'library'] : ['draw', 'type', 'upload'];

  const tabLabels: Record<Tab, string> = {
    draw: t('signaturePad.draw'),
    type: t('signaturePad.type'),
    upload: t('signaturePad.uploadImage'),
    library: t('signaturePad.pickFromLibrary'),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[min(520px,90vw)] rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex gap-1 text-sm">
            {tabs.map((tTab) => (
              <button
                key={tTab}
                onClick={() => setTab(tTab)}
                className={`rounded px-3 py-1 ${
                  tab === tTab ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {tabLabels[tTab]}
              </button>
            ))}
          </div>
          <button
            onClick={props.onClose}
            className="text-gray-400 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        {error && (
          <div className="mb-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {tab === 'draw' && (
          <DrawTab
            {...props}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
          />
        )}
        {tab === 'type' && (
          <TypeTab
            {...props}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
          />
        )}
        {tab === 'upload' && (
          <UploadTab
            {...props}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
          />
        )}
        {tab === 'library' && props.mode === 'registered' && (
          <LibraryTab
            savedSignatures={props.savedSignatures ?? []}
            onComplete={props.onComplete}
          />
        )}
      </div>
    </div>
  );
}

function DrawTab({
  mode,
  inviteToken,
  documentId,
  uploadBlob,
  onComplete,
  busy,
  setBusy,
  setError,
}: SignaturePadProps & {
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
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
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
  }

  function down(e: React.MouseEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    const rect = c.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }
  function move(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    const rect = c.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  }
  function up() {
    drawing.current = false;
  }

  async function use() {
    const c = canvasRef.current;
    if (!c) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        c.toBlob(resolve, 'image/png'),
      );
      if (!blob) throw new Error(t('signaturePad.captureFailed'));
      const imageKey = await uploadSignatureBlob(blob, {
        mode,
        inviteToken,
        documentId,
        uploadBlob,
      });
      onComplete(imageKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signaturePad.uploadFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={480}
        height={180}
        className="block w-full border border-gray-300 bg-white"
        onMouseDown={down}
        onMouseMove={move}
        onMouseUp={up}
        onMouseLeave={up}
      />
      <div className="mt-3 flex gap-2">
        <button onClick={clear} className="rounded bg-gray-100 px-3 py-1 text-sm">
          {t('signaturePad.clear')}
        </button>
        <button
          onClick={use}
          disabled={busy}
          className="rounded bg-black px-4 py-1 text-sm text-white disabled:opacity-50"
        >
          {busy ? t('common.uploading') : t('signaturePad.useSignature')}
        </button>
      </div>
    </div>
  );
}

function TypeTab({
  mode,
  inviteToken,
  documentId,
  uploadBlob,
  onComplete,
  busy,
  setBusy,
  setError,
}: SignaturePadProps & {
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#000';
    ctx.font = 'italic 48px "Dancing Script", cursive';
    ctx.textBaseline = 'middle';
    ctx.fillText(name || t('signaturePad.yourName'), 20, c.height / 2);
  }, [name, t]);

  async function use() {
    if (!name) return;
    const c = canvasRef.current;
    if (!c) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        c.toBlob(resolve, 'image/png'),
      );
      if (!blob) throw new Error(t('signaturePad.captureFailed'));
      const imageKey = await uploadSignatureBlob(blob, {
        mode,
        inviteToken,
        documentId,
        uploadBlob,
      });
      onComplete(imageKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signaturePad.uploadFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        type="text"
        placeholder={t('signaturePad.typeYourName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mb-3 w-full rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <canvas
        ref={canvasRef}
        width={480}
        height={120}
        className="block w-full border border-gray-300 bg-white"
      />
      <button
        onClick={use}
        disabled={busy || !name}
        className="mt-3 rounded bg-black px-4 py-1 text-sm text-white disabled:opacity-50"
      >
        {busy ? t('common.uploading') : t('signaturePad.useSignature')}
      </button>
    </div>
  );
}

function UploadTab({
  mode,
  inviteToken,
  documentId,
  uploadBlob,
  onComplete,
  busy,
  setBusy,
  setError,
}: SignaturePadProps & {
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBlob(file);
    setPreview(URL.createObjectURL(file));
  }

  async function use() {
    if (!blob) return;
    setBusy(true);
    setError(null);
    try {
      const imageKey = await uploadSignatureBlob(blob, {
        mode,
        inviteToken,
        documentId,
        uploadBlob,
      });
      onComplete(imageKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signaturePad.uploadFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-gray-300 p-6 text-sm text-gray-500 hover:border-gray-400 hover:bg-gray-50"
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          <img src={preview} className="max-h-36 object-contain" alt="preview" />
        ) : (
          <>
            <span className="text-3xl">↑</span>
            <span className="mt-1">{t('signaturePad.clickToUpload')}</span>
            <span className="text-xs text-gray-400">PNG, JPG, GIF</span>
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
          onClick={use}
          disabled={busy}
          className="rounded bg-black px-4 py-1 text-sm text-white disabled:opacity-50"
        >
          {busy ? t('common.uploading') : t('signaturePad.useSignature')}
        </button>
      )}
    </div>
  );
}

function LibraryTab({
  savedSignatures,
  onComplete,
}: {
  savedSignatures: SavedSignatureDto[];
  onComplete: (imageKey: string, savedSignatureId?: string) => void;
}) {
  const { t } = useTranslation();
  if (savedSignatures.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-gray-500">
        {t('signaturePad.noSavedSignatures')}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {savedSignatures.map((s) => (
        <button
          key={s._id}
          onClick={() => onComplete('', s._id)}
          className="rounded border border-gray-200 p-2 hover:border-black"
        >
          <img src={s.imageUrl} alt={s.label} className="h-20 w-full object-contain" />
          <p className="mt-1 truncate text-xs">{s.label}</p>
        </button>
      ))}
    </div>
  );
}

async function uploadSignatureBlob(
  blob: Blob,
  opts: {
    mode: 'guest' | 'registered';
    inviteToken?: string;
    documentId?: string;
    uploadBlob?: (blob: Blob) => Promise<string>;
  },
): Promise<string> {
  if (opts.mode === 'registered') {
    if (!opts.uploadBlob) {
      throw new Error('Signature upload is not configured');
    }
    return opts.uploadBlob(blob);
  }

  if (!opts.inviteToken) throw new Error('Missing invite token');
  const r = await apiClient.post<{ uploadUrl: string; imageKey: string }>(
    '/storage/upload-url/guest',
    undefined,
    { query: { token: opts.inviteToken } },
  );

  const res = await fetch(r.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: blob,
  });
  if (!res.ok) throw new Error(`Storage upload failed (${res.status})`);
  return r.imageKey;
}

/**
 * Convenience hook returning a function that uploads a blob via the
 * registered-user endpoint. Components that need this should use this hook.
 */
export function useUploadRegisteredSignature() {
  const api = useApiClient();
  return async (blob: Blob, type: 'drawn' | 'typed' | 'uploaded') => {
    const { uploadUrl, imageKey } = await api.post<{
      uploadUrl: string;
      imageKey: string;
    }>('/users/me/signatures/upload-url', { type });
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
    });
    if (!res.ok) throw new Error(`Storage upload failed (${res.status})`);
    return imageKey;
  };
}
