export function clerkErrorMessage(err: unknown, fallback: string): string {
  if (
    err &&
    typeof err === 'object' &&
    'errors' in err &&
    Array.isArray((err as { errors: unknown }).errors)
  ) {
    const first = (
      err as { errors: Array<{ longMessage?: string; message?: string }> }
    ).errors[0];
    return first?.longMessage ?? first?.message ?? fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
