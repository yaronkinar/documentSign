import { Types } from 'mongoose';

import type { WorkflowStep } from './document.schema';
import type { Signer } from './document.schema';

/**
 * Resolve a signer on a step by subdocument id and/or email.
 * Supports legacy signers that were saved without a stable _id.
 */
export function findSignerOnStep(
  step: WorkflowStep,
  signerId: string,
  email?: string,
): Signer | undefined {
  const id = signerId.trim();
  if (id && Types.ObjectId.isValid(id) && id.length === 24) {
    const byMongooseId = step.signers.id(id);
    if (byMongooseId) return byMongooseId;
    const byStringId = step.signers.find((s) => String(s._id) === id);
    if (byStringId) return byStringId;
  }

  const normalizedEmail = (email ?? (id.includes('@') ? id : ''))
    .trim()
    .toLowerCase();
  if (normalizedEmail) {
    return step.signers.find((s) => s.email === normalizedEmail);
  }

  if (id) {
    return step.signers.find((s) => String(s._id) === id);
  }

  return undefined;
}
