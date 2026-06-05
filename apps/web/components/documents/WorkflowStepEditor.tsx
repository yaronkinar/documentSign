'use client';

import { useState } from 'react';
import { MUNICIPAL_APPROVAL_SIGNER_TITLES } from '@docflow/shared';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

export interface SignerInput {
  email: string;
  name?: string;
}

export interface WorkflowStepInput {
  label: string;
  stepType: 'review' | 'signature' | 'approval';
  signers: SignerInput[];
}

export function stepTypeLabel(stepType: string, t: (key: string) => string): string {
  switch (stepType) {
    case 'signature':
      return t('newDocument.stepTypeSignature');
    case 'review':
      return t('newDocument.stepTypeReview');
    case 'approval':
      return t('newDocument.stepTypeApproval');
    default:
      return stepType;
  }
}

export function WorkflowStepEditor({
  steps,
  currentUserEmail,
  currentUserName,
  onAddStep,
  onUpdateStep,
  onRemoveStep,
  onAddSigner,
  onRemoveSigner,
  onNext,
  onBack,
  nextLabel,
  nextDisabled,
  showNav = true,
}: {
  steps: WorkflowStepInput[];
  currentUserEmail: string;
  currentUserName: string;
  onAddStep: () => void;
  onUpdateStep: (i: number, patch: Partial<WorkflowStepInput>) => void;
  onRemoveStep: (i: number) => void;
  onAddSigner: (i: number, s: SignerInput) => void;
  onRemoveSigner: (i: number, j: number) => void;
  onNext: () => void;
  onBack?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showNav?: boolean;
}) {
  const { t } = useTranslation();
  const missingSignerEmail = steps.some((s) =>
    s.signers.some((sg) => !sg.email.trim()),
  );
  return (
    <div className="space-y-4">
      {steps.length > 0 && missingSignerEmail && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t('newDocument.extractedSignersHint')}
        </div>
      )}
      {steps.map((s, i) => (
        <StepCard
          key={i}
          step={s}
          currentUserEmail={currentUserEmail}
          currentUserName={currentUserName}
          onUpdate={(patch) => onUpdateStep(i, patch)}
          onRemove={() => onRemoveStep(i)}
          onAddSigner={(signer) => onAddSigner(i, signer)}
          onRemoveSigner={(j) => onRemoveSigner(i, j)}
        />
      ))}
      <button
        type="button"
        onClick={onAddStep}
        className="rounded border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
      >
        {t('newDocument.addStep')}
      </button>
      {showNav && (
        <div className="flex justify-between pt-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-gray-600 hover:underline"
            >
              ← {t('common.back')}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onNext}
            disabled={
              nextDisabled ??
              (steps.length === 0 ||
                steps.some((s) => s.signers.length === 0) ||
                missingSignerEmail)
            }
            className="rounded bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {nextLabel ?? t('common.next')}
          </button>
        </div>
      )}
    </div>
  );
}

function StepCard({
  step,
  currentUserEmail,
  onUpdate,
  onRemove,
  onAddSigner,
  onRemoveSigner,
}: {
  step: WorkflowStepInput;
  currentUserEmail: string;
  currentUserName: string;
  onUpdate: (patch: Partial<WorkflowStepInput>) => void;
  onRemove: () => void;
  onAddSigner: (s: SignerInput) => void;
  onRemoveSigner: (j: number) => void;
}) {
  const { t } = useTranslation();
  const [selectedTitle, setSelectedTitle] = useState('');
  const [customName, setCustomName] = useState('');
  const [newSignerEmail, setNewSignerEmail] = useState('');

  const usedTitles = new Set(
    step.signers.map((s) => s.name).filter((name): name is string => !!name),
  );
  const resolvedName =
    selectedTitle === '__custom__' ? customName.trim() : selectedTitle;

  function updateSigner(index: number, patch: Partial<SignerInput>) {
    onUpdate({
      signers: step.signers.map((sig, idx) =>
        idx === index ? { ...sig, ...patch } : sig,
      ),
    });
  }

  function addSigner() {
    const email = newSignerEmail.trim().toLowerCase();
    if (!email) return;
    onAddSigner({ email, name: resolvedName || undefined });
    setSelectedTitle('');
    setCustomName('');
    setNewSignerEmail('');
  }

  function addAllApprovalRoles() {
    const toAdd = MUNICIPAL_APPROVAL_SIGNER_TITLES.filter(
      (title) => !usedTitles.has(title),
    ).map((name) => ({ email: '', name }));
    if (toAdd.length === 0) return;
    onUpdate({ signers: [...step.signers, ...toAdd] });
  }

  const hasMissingEmail = step.signers.some((s) => !s.email.trim());
  const pendingApprovalRoles = MUNICIPAL_APPROVAL_SIGNER_TITLES.filter(
    (title) => !usedTitles.has(title),
  );

  return (
    <div
      className={`rounded border p-4 ${hasMissingEmail ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <input
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          value={step.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
        <select
          className="rounded border border-gray-300 px-2 py-1 text-sm"
          value={step.stepType}
          onChange={(e) =>
            onUpdate({ stepType: e.target.value as WorkflowStepInput['stepType'] })
          }
        >
          <option value="signature">{t('newDocument.stepTypeSignature')}</option>
          <option value="review">{t('newDocument.stepTypeReview')}</option>
          <option value="approval">{t('newDocument.stepTypeApproval')}</option>
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-600 hover:underline"
        >
          {t('common.remove')}
        </button>
      </div>
      <ul className="mb-3 space-y-2 text-sm">
        {step.signers.map((s, j) => {
          const needsEmail = !s.email.trim();
          const hasRoleName = Boolean(s.name?.trim());
          const isKnownMunicipalRole =
            hasRoleName &&
            MUNICIPAL_APPROVAL_SIGNER_TITLES.includes(
              s.name as (typeof MUNICIPAL_APPROVAL_SIGNER_TITLES)[number],
            );
          return (
            <li
              key={j}
              className={`space-y-2 rounded px-3 py-3 ${needsEmail ? 'border border-amber-200 bg-amber-50' : 'border border-gray-100 bg-gray-50'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {hasRoleName ? (
                    <>
                      <select
                        className="w-full max-w-xs rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                        value={isKnownMunicipalRole ? s.name : '__custom__'}
                        onChange={(e) => {
                          const value = e.target.value;
                          updateSigner(j, {
                            name:
                              value === '__custom__' ? (s.name ?? '') : value,
                          });
                        }}
                      >
                        <option value="">{t('newDocument.selectRolePlaceholder')}</option>
                        {MUNICIPAL_APPROVAL_SIGNER_TITLES.map((title) => (
                          <option key={title} value={title}>
                            {title}
                          </option>
                        ))}
                        <option value="__custom__">{t('newDocument.customRole')}</option>
                      </select>
                      {!isKnownMunicipalRole && (
                        <input
                          type="text"
                          placeholder={t('newDocument.namePlaceholder')}
                          className="w-full max-w-xs rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                          value={s.name ?? ''}
                          onChange={(e) => updateSigner(j, { name: e.target.value })}
                        />
                      )}
                    </>
                  ) : (
                    <input
                      type="text"
                      placeholder={t('newDocument.namePlaceholder')}
                      className="w-full max-w-xs rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                      value={s.name ?? ''}
                      onChange={(e) => updateSigner(j, { name: e.target.value })}
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveSigner(j)}
                  className="shrink-0 text-xs text-gray-400 hover:text-red-600"
                >
                  {t('common.remove')}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="w-14 shrink-0 text-xs font-medium text-gray-600">
                  {t('newDocument.emailLabel')}
                </label>
                <input
                  type="email"
                  required
                  aria-label={t('newDocument.emailLabel')}
                  placeholder={t('newDocument.emailPlaceholder')}
                  className="w-full max-w-md flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                  value={s.email}
                  onChange={(e) => updateSigner(j, { email: e.target.value })}
                />
                {currentUserEmail && needsEmail && (
                  <button
                    type="button"
                    onClick={() =>
                      updateSigner(j, { email: currentUserEmail.trim().toLowerCase() })
                    }
                    className="shrink-0 text-xs text-blue-700 hover:underline"
                  >
                    {t('newDocument.addMe')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="space-y-2 rounded border border-dashed border-gray-200 bg-gray-50/50 p-3">
        <p className="text-xs font-medium text-gray-600">{t('newDocument.addSignerHeading')}</p>
        <div className="flex flex-wrap gap-2">
          <select
            className="min-w-56 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            value={selectedTitle}
            onChange={(e) => setSelectedTitle(e.target.value)}
          >
            <option value="">{t('newDocument.selectRolePlaceholder')}</option>
            {MUNICIPAL_APPROVAL_SIGNER_TITLES.map((title) => (
              <option key={title} value={title} disabled={usedTitles.has(title)}>
                {title}
              </option>
            ))}
            <option value="__custom__">{t('newDocument.customRole')}</option>
          </select>
          {selectedTitle === '__custom__' && (
            <input
              type="text"
              placeholder={t('newDocument.namePlaceholder')}
              className="w-48 rounded border border-gray-300 bg-white px-2 py-1 text-sm"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="w-14 shrink-0 text-xs font-medium text-gray-600">
            {t('newDocument.emailLabel')}
          </label>
          <input
            type="email"
            aria-label={t('newDocument.emailLabel')}
            placeholder={t('newDocument.emailPlaceholder')}
            className="w-full max-w-md flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            value={newSignerEmail}
            onChange={(e) => setNewSignerEmail(e.target.value)}
          />
          {currentUserEmail && (
            <button
              type="button"
              onClick={() =>
                setNewSignerEmail(currentUserEmail.trim().toLowerCase())
              }
              className="text-xs text-blue-700 hover:underline"
            >
              {t('newDocument.addMe')}
            </button>
          )}
          <button
            type="button"
            onClick={addSigner}
            disabled={!newSignerEmail.trim()}
            className="rounded bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {t('common.add')}
          </button>
        </div>
        {pendingApprovalRoles.length > 0 && (
          <button
            type="button"
            onClick={addAllApprovalRoles}
            className="text-xs text-blue-700 hover:underline"
          >
            {t('newDocument.addAllApprovals')} ({pendingApprovalRoles.length})
          </button>
        )}
      </div>
    </div>
  );
}
