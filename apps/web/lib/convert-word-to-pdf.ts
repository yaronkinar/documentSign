/** Converts a Word document to PDF via the API (requires LibreOffice on the server). */
export async function convertWordToPdf(
  file: File,
  postFormData: (path: string, formData: FormData) => Promise<Response>,
): Promise<Blob> {
  const form = new FormData();
  form.append('file', file, file.name);

  const res = await postFormData('/documents/convert-to-pdf', form);

  if (!res.ok) {
    let message = `Conversion failed: ${res.status}`;
    try {
      const data = await res.json();
      if (data?.message) {
        message = Array.isArray(data.message)
          ? data.message.join(', ')
          : String(data.message);
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.blob();
}

export function pdfFileFromBlob(blob: Blob, sourceName: string): File {
  const pdfName = sourceName.replace(/\.docx?$/i, '.pdf');
  return new File([blob], pdfName, { type: 'application/pdf' });
}
