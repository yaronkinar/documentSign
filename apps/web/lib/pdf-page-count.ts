/** Best-effort page count for a PDF file in the browser. */
export async function getPdfPageCount(file: File): Promise<number> {
  try {
    const buf = await file.arrayBuffer();
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const count = doc.numPages;
    await doc.destroy();
    return count > 0 ? count : 1;
  } catch {
    return 1;
  }
}
