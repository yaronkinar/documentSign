export function isPdfFile(file: File): boolean {
  return (
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  );
}

export function isWordFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith('.doc') ||
    lower.endsWith('.docx') ||
    file.type === 'application/msword' ||
    file.type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

export function isSupportedDocumentUpload(file: File): boolean {
  return isPdfFile(file) || isWordFile(file);
}

export function titleFromUploadFile(file: File, fallbackTitle: string): string {
  const base = file.name.replace(/\.(pdf|docx?)$/i, '').trim();
  return base || fallbackTitle;
}

export function wordExtension(file: File): '.doc' | '.docx' | null {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.docx')) return '.docx';
  if (lower.endsWith('.doc')) return '.doc';
  if (
    file.type ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return '.docx';
  }
  if (file.type === 'application/msword') return '.doc';
  return null;
}

export const DOCUMENT_UPLOAD_ACCEPT =
  'application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx';
