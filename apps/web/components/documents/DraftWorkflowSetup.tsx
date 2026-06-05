'use client';

import { useState } from 'react';
import type { DocumentDto } from '@docflow/shared';
import { useApiClient } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n/LocaleProvider';
import {
  WorkflowStepEditor,
  type SignerInput,
  type WorkflowStepInput,
} from '@/components/documents/WorkflowStepEditor';

interface Props {
  documentId: string;
  currentUserEmail: string;
  currentUserName: string;
  onSaved: (doc: DocumentDto) => void;
}

export function DraftWorkflowSetup({
  documentId,
  currentUserEmail,
  currentUserName,
  onSaved,
}: Props) {
  const api = useApiClient();
  const { t } = useTranslation();
  const [steps, setSteps] = useState<WorkflowStepInput[]>([
    {
      label: t('newDocument.stepLabel', { n: 1 }),
      stepType: 'signature',
      signers: [],
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        label: t('newDocument.stepLabel', { n: prev.length + 1 }),
        stepType: 'signature',
        signers: [],
      },
    ]);
  }

  function updateStep(i: number, patch: Partial<WorkflowStepInput>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addSigner(stepIndex: number, signer: SignerInput) {
    setSteps((prev) =>
      prev.map((s, idx) =>
        idx === stepIndex ? { ...s, signers: [...s.signers, signer] } : s,
      ),
    );
  }

  function removeSigner(stepIndex: number, signerIndex: number) {
    setSteps((prev) =>
      prev.map((s, idx) =>
        idx === stepIndex
          ? { ...s, signers: s.signers.filter((_, i) => i !== signerIndex) }
          : s,
      ),
    );
  }

  async function saveWorkflow() {
    setBusy(true);
    setError(null);
    try {
      let latest: DocumentDto | null = null;
      for (const s of steps) {
        if (s.signers.length === 0) {
          throw new Error(t('newDocument.stepNoSigners', { label: s.label }));
        }
        const missingEmail = s.signers.filter((sg) => !sg.email.trim());
        if (missingEmail.length > 0) {
          throw new Error(
            t('newDocument.stepMissingEmail', {
              label: s.label,
              names: missingEmail.map((sg) => sg.name ?? '?').join(', '),
            }),
          );
        }
        const resolvedSigners = s.signers.map((sg) => ({
          ...sg,
          email: sg.email.trim().toLowerCase(),
        }));
        latest = await api.post<DocumentDto>(`/documents/${documentId}/steps`, {
          label: s.label,
          stepType: s.stepType,
          executionMode: 'parallel',
          signers: resolvedSigners,
        });
      }
      if (latest) onSaved(latest);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.saveWorkflowFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-amber-900">{t('document.setupWorkflowHint')}</p>
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <WorkflowStepEditor
        steps={steps}
        currentUserEmail={currentUserEmail}
        currentUserName={currentUserName}
        onAddStep={addStep}
        onUpdateStep={updateStep}
        onRemoveStep={removeStep}
        onAddSigner={addSigner}
        onRemoveSigner={removeSigner}
        onNext={() => void saveWorkflow()}
        nextLabel={busy ? t('common.saving') : t('document.saveWorkflow')}
        nextDisabled={busy || steps.length === 0}
        showNav
      />
    </div>
  );
}
