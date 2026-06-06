import type { SignerProfileDto } from '@docflow/shared';

import type {
  SignerInput,
  WorkflowStepInput,
} from '@/components/documents/WorkflowStepEditor';

type ApiGet = <T>(path: string) => Promise<T>;
type ApiPost = <T>(path: string, body?: unknown) => Promise<T>;

export async function fetchSignerProfiles(
  api: { get: ApiGet },
  templateId: string,
): Promise<SignerProfileDto[]> {
  try {
    return await api.get<SignerProfileDto[]>(
      `/signer-profiles?templateId=${encodeURIComponent(templateId)}`,
    );
  } catch {
    return [];
  }
}

export function signersFromRolesAndProfiles(
  roleNames: string[],
  profiles: SignerProfileDto[],
): SignerInput[] {
  const profileByTitle = new Map(profiles.map((p) => [p.title.trim(), p]));
  const seen = new Set<string>();
  const signers: SignerInput[] = [];

  const addRole = (role: string) => {
    const trimmed = role.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    const profile = profileByTitle.get(trimmed);
    signers.push({
      name: trimmed,
      email: profile?.email?.trim() ?? '',
    });
  };

  for (const role of roleNames) addRole(role);
  for (const profile of profiles) addRole(profile.title);

  return signers;
}

export function workflowStepFromProfiles(
  profiles: SignerProfileDto[],
  roleNames: string[],
  label: string,
  stepType: WorkflowStepInput['stepType'],
): WorkflowStepInput {
  return {
    label,
    stepType,
    signers: signersFromRolesAndProfiles(roleNames, profiles),
  };
}

export async function hydrateWorkflowStepsFromProfiles(
  api: { get: ApiGet },
  templateId: string,
  currentSteps: WorkflowStepInput[],
  fallbackRoleNames: string[] = [],
): Promise<WorkflowStepInput[]> {
  const profiles = await fetchSignerProfiles(api, templateId);
  const existingRoles = currentSteps.flatMap((step) =>
    step.signers
      .map((signer) => signer.name?.trim())
      .filter((name): name is string => !!name),
  );
  const roleNames =
    existingRoles.length > 0
      ? existingRoles
      : fallbackRoleNames.length > 0
        ? fallbackRoleNames
        : profiles.map((profile) => profile.title);

  if (profiles.length === 0 && roleNames.length === 0) {
    return currentSteps;
  }

  const first = currentSteps[0];
  return [
    workflowStepFromProfiles(
      profiles,
      roleNames,
      first?.label ?? 'Signatures',
      first?.stepType ?? 'approval',
    ),
  ];
}

/** Create placeholder signer profiles for roles not yet in the directory. */
export async function ensureSignerProfilesForRoles(
  api: { get: ApiGet; post: ApiPost },
  templateId: string,
  roleNames: string[],
): Promise<SignerProfileDto[]> {
  const existing = await fetchSignerProfiles(api, templateId);
  const usedTitles = new Set(existing.map((p) => p.title.trim()));
  const missing = roleNames
    .map((role) => role.trim())
    .filter((role) => role.length > 0 && !usedTitles.has(role));

  if (missing.length === 0) return existing;

  const created = await Promise.all(
    missing.map((title) =>
      api.post<SignerProfileDto>('/signer-profiles', {
        templateId,
        title,
        name: '—',
      }),
    ),
  );

  return [...existing, ...created].sort((a, b) =>
    a.title.localeCompare(b.title, 'he'),
  );
}
