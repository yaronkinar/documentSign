import { HEBREW_SAMPLE_PDF_FILENAME } from '@docflow/shared';

/** Download the canonical haknasot municipal form PDF. */
export async function downloadHaknasotPdf(
  filename = HEBREW_SAMPLE_PDF_FILENAME,
) {
  const res = await fetch(`/samples/${HEBREW_SAMPLE_PDF_FILENAME}`);
  if (!res.ok) {
    throw new Error('Haknasot sample PDF not found in /public/samples');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
