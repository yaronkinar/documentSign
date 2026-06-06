'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  appendSignerMentionToDraft,
  filterSignersByNameQuery,
  formatSignerMentionPlain,
  parseCommentContent,
  resolveMentionedEmails,
  signerDisplayName,
  type SignerMentionRef,
} from '@docflow/shared';

import { useTranslation } from '@/lib/i18n/LocaleProvider';

export interface CommentSignerOption extends SignerMentionRef {
  stepLabel: string;
}

export interface SignerTagRequest {
  key: number;
  email: string;
  name: string | null;
}

interface CommentComposerProps {
  signers: CommentSignerOption[];
  myEmail: string;
  placeholder: string;
  mentionHint: string;
  postLabel: string;
  tagSignerRequest?: SignerTagRequest | null;
  onTagSignerConsumed?: () => void;
  onPost: (content: string, mentionedEmails: string[]) => void | Promise<void>;
}

export function CommentContent({
  content,
  signers = [],
}: {
  content: string;
  signers?: SignerMentionRef[];
}) {
  const parts = parseCommentContent(content, signers);
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, index) =>
        part.type === 'mention' ? (
          <span
            key={`${part.email}-${index}`}
            className="rounded bg-blue-50 px-1 font-medium text-blue-800"
            title={part.email}
          >
            @{part.label}
          </span>
        ) : (
          <span key={`text-${index}`}>{part.value}</span>
        ),
      )}
    </span>
  );
}

const ACTIVE_MENTION_PATTERN = /(^|\s)@([^@]{0,80})$/;

export function CommentComposer({
  signers,
  myEmail,
  placeholder,
  mentionHint,
  postLabel,
  tagSignerRequest,
  onTagSignerConsumed,
  onPost,
}: CommentComposerProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const taggableSigners = useMemo(
    () =>
      signers.filter(
        (signer) =>
          (signer.email.trim().includes('@') || !!signer.name?.trim()) &&
          signer.email.toLowerCase() !== myEmail.toLowerCase(),
      ),
    [signers, myEmail],
  );

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    return filterSignersByNameQuery(taggableSigners, mentionQuery).filter(
      (signer) => signer.email.trim().includes('@'),
    );
  }, [mentionQuery, taggableSigners]);

  useLayoutEffect(() => {
    if (!tagSignerRequest) return;
    const hasEmail = tagSignerRequest.email.includes('@');
    const hasName = !!tagSignerRequest.name?.trim();
    if (!hasEmail && !hasName) return;

    const signer =
      (hasEmail
        ? taggableSigners.find(
            (entry) =>
              entry.email.toLowerCase() === tagSignerRequest.email.toLowerCase(),
          )
        : taggableSigners.find(
            (entry) =>
              !!tagSignerRequest.name?.trim() &&
              signerDisplayName(entry).toLowerCase() ===
                tagSignerRequest.name!.trim().toLowerCase(),
          )) ?? tagSignerRequest;

    setDraft((prev) => appendSignerMentionToDraft(prev, signer));
    setMentionQuery(null);
    setMentionIndex(0);
    onTagSignerConsumed?.();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [tagSignerRequest?.key]);

  function updateMentionState(value: string, cursor: number) {
    const beforeCursor = value.slice(0, cursor);
    const atMatch = beforeCursor.match(ACTIVE_MENTION_PATTERN);
    if (!atMatch) {
      setMentionQuery(null);
      setMentionIndex(0);
      return;
    }
    setMentionQuery(atMatch[2] ?? '');
    setMentionIndex(0);
  }

  function insertMention(signer: CommentSignerOption) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursor = textarea.selectionStart ?? draft.length;
    const beforeCursor = draft.slice(0, cursor);
    const afterCursor = draft.slice(cursor);
    const atMatch = beforeCursor.match(ACTIVE_MENTION_PATTERN);
    if (!atMatch) return;

    const prefix = beforeCursor.slice(0, atMatch.index! + (atMatch[1]?.length ?? 0));
    const mention = `${formatSignerMentionPlain(signer.name, signer.email)} `;
    const nextValue = `${prefix}${mention}${afterCursor}`;
    setDraft(nextValue);
    setMentionQuery(null);
    setMentionIndex(0);

    requestAnimationFrame(() => {
      const nextCursor = prefix.length + mention.length;
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  }

  async function handlePost() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await onPost(trimmed, resolveMentionedEmails(trimmed, taggableSigners));
    setDraft('');
    setMentionQuery(null);
    setMentionIndex(0);
  }

  return (
    <div className="relative">
      {mentionQuery !== null && mentionMatches.length > 0 && (
        <ul className="absolute bottom-full left-0 right-0 z-10 mb-1 max-h-48 overflow-auto rounded border border-gray-200 bg-white shadow-md">
          {mentionMatches.map((signer, index) => {
            const label = signerDisplayName(signer);
            return (
              <li key={`${signer.email}-${signer.stepLabel}`}>
                <button
                  type="button"
                  className={`block w-full px-3 py-2 text-start text-sm hover:bg-gray-50 ${
                    index === mentionIndex ? 'bg-blue-50' : ''
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMention(signer);
                  }}
                >
                  <span className="font-medium text-gray-900">{label}</span>
                  {signer.name?.trim() && (
                    <span className="ms-2 text-xs text-gray-500">{signer.email}</span>
                  )}
                  <span className="ms-2 text-xs text-gray-400">{signer.stepLabel}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <textarea
        ref={textareaRef}
        rows={2}
        placeholder={placeholder}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          updateMentionState(
            event.target.value,
            event.target.selectionStart ?? event.target.value.length,
          );
        }}
        onKeyDown={(event) => {
          if (mentionQuery !== null && mentionMatches.length > 0) {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setMentionIndex((prev) =>
                prev + 1 >= mentionMatches.length ? 0 : prev + 1,
              );
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setMentionIndex((prev) =>
                prev - 1 < 0 ? mentionMatches.length - 1 : prev - 1,
              );
              return;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault();
              const signer = mentionMatches[mentionIndex];
              if (signer) insertMention(signer);
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setMentionQuery(null);
              return;
            }
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void handlePost();
          }
        }}
        onClick={(event) => {
          updateMentionState(
            event.currentTarget.value,
            event.currentTarget.selectionStart ?? event.currentTarget.value.length,
          );
        }}
      />
      <p className="mt-1 text-xs text-gray-500">{mentionHint}</p>
      <button
        type="button"
        onClick={() => void handlePost()}
        disabled={!draft.trim()}
        className="mt-1 rounded bg-black px-3 py-1 text-xs text-white disabled:opacity-50"
      >
        {postLabel}
      </button>
      {taggableSigners.filter((signer) => signer.email.trim().includes('@')).length ===
        0 && (
        <p className="mt-1 text-xs text-amber-700">{t('document.noSignersToTag')}</p>
      )}
    </div>
  );
}
