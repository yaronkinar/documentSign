'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { GuestSigningDataDto, SignatureDto } from '@docflow/shared';
import { resolveFormTemplateFields } from '@docflow/shared';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PDFViewer } from '@/components/pdf/PDFViewer';
import { SignaturePad } from '@/components/pdf/SignaturePad';
import { apiClient } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { useTemplatePdfUrl } from '@/lib/use-template-pdf-url';

interface Props {
  documentId: string;
  inviteToken: string;
  data: GuestSigningDataDto;
}

interface PendingPlacement {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  signatureFieldId?: string;
}

export function GuestSignClient({ documentId, inviteToken, data }: Props) {
  const { t } = useTranslation();
  const [placementMode, setPlacementMode] = useState(false);
  const [pendingPlacement, setPendingPlacement] = useState<PendingPlacement | null>(
    null,
  );
  const [showSigPad, setShowSigPad] = useState(false);
  const [signatures, setSignatures] = useState<SignatureDto[]>([]);
  const [signatureFields, setSignatureFields] = useState(data.signatureFields);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { pdfUrl: templatePdfUrl, loading: pdfLoading } = useTemplatePdfUrl(
    !data.presignedPdfUrl ? data.formTemplateId : null,
  );
  const viewerPdfUrl = data.presignedPdfUrl ?? templatePdfUrl;
  const formFields = resolveFormTemplateFields(data.formTemplateId);

  const usesAssignedFields = signatureFields.length > 0;
  const pendingFields = useMemo(
    () => signatureFields.filter((f) => !f.signed),
    [signatureFields],
  );

  function onPlace(page: number, x: number, y: number) {
    if (!placementMode) return;
    setPendingPlacement({ page, x, y, width: 15, height: 6 });
    setShowSigPad(true);
  }

  function onFieldClick(field: (typeof signatureFields)[number]) {
    if (field.signed) return;
    setPendingPlacement({
      page: field.pageNumber,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      signatureFieldId: field._id,
    });
    setShowSigPad(true);
  }

  async function onSignatureCaptured(imageKey: string) {
    if (!pendingPlacement) return;
    setShowSigPad(false);
    try {
      const newSig = await apiClient.post<SignatureDto>(
        `/documents/${documentId}/sign`,
        {
          documentId,
          stepId: data.stepId,
          pageNumber: pendingPlacement.page,
          x: pendingPlacement.x,
          y: pendingPlacement.y,
          width: pendingPlacement.width,
          height: pendingPlacement.height,
          imageKey,
          signatureFieldId: pendingPlacement.signatureFieldId,
        },
        { query: { token: inviteToken } },
      );
      setSignatures((prev) => [...prev, newSig]);
      if (pendingPlacement.signatureFieldId) {
        setSignatureFields((prev) => {
          const updated = prev.map((f) =>
            f._id === pendingPlacement.signatureFieldId
              ? { ...f, signed: true }
              : f,
          );
          if (updated.every((f) => f.signed)) {
            setDone(true);
          }
          return updated;
        });
      } else {
        setDone(true);
      }
      setPlacementMode(false);
      setPendingPlacement(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sign.recordSignatureFailed'));
    }
  }

  if (done) {
    const signerName = data.signerName ?? data.signerEmail;
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="mb-6 flex justify-center">
            <LanguageSwitcher />
          </div>
          <h1 className="mb-3 text-2xl font-semibold">{t('sign.thankYou')}</h1>
          <p className="mb-6 text-gray-600">
            {t('sign.signatureRecorded', {
              name: signerName,
              title: data.documentTitle,
            })}
          </p>
          <Link
            href="/sign-up"
            className="inline-block rounded bg-black px-5 py-2 text-sm text-white"
          >
            {t('sign.createAccount')}
          </Link>
        </div>
      </main>
    );
  }

  const mySignerId = signatureFields[0]?.signerId ?? null;

  return (
    <main className="flex h-screen flex-col">
      <header className="border-b px-6 py-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase text-gray-500">{t('common.appName')}</div>
            <h1 className="text-lg font-semibold">{data.documentTitle}</h1>
            <div className="text-xs text-gray-600">
              {t('sign.step')}: {data.stepLabel} · {t('sign.signer')}:{' '}
              {data.signerName ?? data.signerEmail}
            </div>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      {error && (
        <div className="border-b border-red-300 bg-red-50 px-6 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="flex-1 overflow-auto bg-gray-50 p-4">
        {pdfLoading && !viewerPdfUrl && (
          <p className="py-16 text-center text-sm text-gray-500">
            {t('pdf.loading')}
          </p>
        )}
        {viewerPdfUrl && (
        <PDFViewer
          pdfUrl={viewerPdfUrl}
          signatures={signatures}
          signatureFields={signatureFields}
          formFields={formFields.length > 0 ? formFields : undefined}
          formValues={data.formValues}
          placementMode={placementMode}
          activeSignerId={mySignerId}
          onSignaturePlace={onPlace}
          onFieldClick={onFieldClick}
        />
        )}
        <div className="sticky bottom-4 mt-4 flex justify-center gap-2">
          {!usesAssignedFields && !placementMode ? (
            <button
              onClick={() => setPlacementMode(true)}
              className="rounded bg-black px-5 py-2 text-sm font-medium text-white shadow"
            >
              {t('sign.signDocument')}
            </button>
          ) : usesAssignedFields ? (
            <div className="rounded bg-blue-50 px-4 py-2 text-sm text-blue-800 shadow">
              {pendingFields.length > 1
                ? t('sign.clickFieldsToSign')
                : t('sign.clickFieldToSign')}
              {pendingFields.length > 1 &&
                ` (${t('sign.remaining', { count: pendingFields.length })})`}
            </div>
          ) : (
            <button
              onClick={() => setPlacementMode(false)}
              className="rounded bg-gray-200 px-5 py-2 text-sm"
            >
              {t('common.cancel')}
            </button>
          )}
        </div>
      </section>

      {showSigPad && (
        <SignaturePad
          mode="guest"
          inviteToken={inviteToken}
          documentId={documentId}
          onClose={() => {
            setShowSigPad(false);
            setPendingPlacement(null);
          }}
          onComplete={(imageKey) => onSignatureCaptured(imageKey)}
        />
      )}
    </main>
  );
}
