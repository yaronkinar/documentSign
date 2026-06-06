export const MENTION_PATTERN = /@\[([^\]]+)\]\(([^)]+)\)/g;

export interface SignerMentionRef {
  email: string;
  name: string | null;
}

export function signerDisplayName(signer: SignerMentionRef): string {
  return signer.name?.trim() || signer.email.split('@')[0] || signer.email;
}

export function formatSignerMention(name: string | null, email: string): string {
  const label = signerDisplayName({ name, email });
  return `@[${label}](${email.toLowerCase()})`;
}

/** Plain `@Name` shown in the composer while typing. */
export function formatSignerMentionPlain(name: string | null, email: string): string {
  return `@${signerDisplayName({ name, email })}`;
}

export function appendSignerMentionToDraft(
  draft: string,
  signer: SignerMentionRef,
): string {
  const mention = `${formatSignerMentionPlain(signer.name, signer.email)} `;
  const trimmed = draft.trimEnd();
  if (!trimmed) return mention;
  if (trimmed.endsWith(mention.trim())) return trimmed;
  return `${trimmed} ${mention}`;
}

export function extractMentionedEmails(content: string): string[] {
  const emails = new Set<string>();
  for (const match of content.matchAll(MENTION_PATTERN)) {
    const email = match[2]?.trim().toLowerCase();
    if (email?.includes('@')) emails.add(email);
  }
  return [...emails];
}

export function resolveMentionedEmails(
  content: string,
  signers: SignerMentionRef[],
): string[] {
  const emails = new Set(extractMentionedEmails(content));
  const names = listSignerNamesByLength(signers);

  for (const match of content.matchAll(/(^|\s)@([^\s@][^\n@]{0,80})/g)) {
    const raw = match[2]?.trim();
    if (!raw) continue;
    const email = resolveNameToEmail(raw, names);
    if (email) emails.add(email);
  }

  return [...emails];
}

function listSignerNamesByLength(signers: SignerMentionRef[]) {
  return signers
    .filter((signer) => signer.email.trim().includes('@'))
    .map((signer) => ({
      email: signer.email.trim().toLowerCase(),
      label: signerDisplayName(signer),
    }))
    .sort((a, b) => b.label.length - a.label.length);
}

function resolveNameToEmail(
  raw: string,
  names: { email: string; label: string }[],
): string | null {
  const normalized = raw.trim().toLowerCase();
  for (const entry of names) {
    if (entry.label.toLowerCase() === normalized) return entry.email;
  }
  return null;
}

export type CommentContentPart =
  | { type: 'text'; value: string }
  | { type: 'mention'; label: string; email: string };

export function parseCommentContent(
  content: string,
  signers: SignerMentionRef[] = [],
): CommentContentPart[] {
  const tokens: Array<{
    index: number;
    length: number;
    label: string;
    email: string;
  }> = [];

  for (const match of content.matchAll(MENTION_PATTERN)) {
    const index = match.index ?? 0;
    tokens.push({
      index,
      length: match[0].length,
      label: match[1]?.trim() || match[2] || '',
      email: (match[2] ?? '').trim().toLowerCase(),
    });
  }

  const names = listSignerNamesByLength(signers);
  for (const match of content.matchAll(/(^|\s)@([^\s@][^\n@]{0,80})/g)) {
    const index = (match.index ?? 0) + (match[1]?.length ?? 0);
    const raw = match[2]?.trim();
    if (!raw) continue;
    const email = resolveNameToEmail(raw, names);
    if (!email) continue;
    const label = names.find((entry) => entry.email === email)?.label ?? raw;
    tokens.push({
      index,
      length: match[0].trimStart().length,
      label,
      email,
    });
  }

  tokens.sort((a, b) => a.index - b.index);

  const parts: CommentContentPart[] = [];
  let lastIndex = 0;
  for (const token of tokens) {
    if (token.index < lastIndex) continue;
    if (token.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, token.index) });
    }
    parts.push({
      type: 'mention',
      label: token.label,
      email: token.email,
    });
    lastIndex = token.index + token.length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', value: content }];
}

export function filterSignersByNameQuery<T extends SignerMentionRef>(
  signers: T[],
  query: string,
): T[] {
  const normalized = query.trim().toLowerCase();
  const eligible = signers.filter(
    (signer) => signer.email.trim().includes('@') || !!signer.name?.trim(),
  );

  if (!normalized) {
    return [...eligible].sort((a, b) =>
      signerDisplayName(a).localeCompare(signerDisplayName(b)),
    );
  }

  return eligible
    .filter((signer) => {
      const label = signerDisplayName(signer).toLowerCase();
      const email = signer.email.toLowerCase();
      return label.includes(normalized) || email.includes(normalized);
    })
    .sort((a, b) => {
      const aLabel = signerDisplayName(a).toLowerCase();
      const bLabel = signerDisplayName(b).toLowerCase();
      const aStarts = aLabel.startsWith(normalized) ? 0 : 1;
      const bStarts = bLabel.startsWith(normalized) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return aLabel.localeCompare(bLabel);
    });
}
