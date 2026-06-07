import { pdfjsLib } from '@/lib/pdfjs-client';

const PAGE_COUNT_TIMEOUT_MS = 10_000;

/** Best-effort page count for a PDF file in the browser. */
export async function getPdfPageCount(file: File): Promise<number> {
  try {
    const buf = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: buf,
    });
    const doc = await Promise.race([
      loadingTask.promise,
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('PDF page count timed out')),
          PAGE_COUNT_TIMEOUT_MS,
        );
      }),
    ]);
    const count = doc.numPages;
    await doc.destroy();
    return count > 0 ? count : 1;
  } catch {
    return 1;
  }
}
