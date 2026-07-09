import { LocalStorageBackend } from './local-storage.backend';

describe('LocalStorageBackend upload/download URLs', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses API_PUBLIC_URL as the base for upload URLs when set', async () => {
    process.env.API_PUBLIC_URL = 'https://api.docflows.uk';
    delete process.env.PORT;
    const backend = new LocalStorageBackend();

    const url = await backend.getUploadUrl('docs/abc/file.pdf', 'application/pdf');

    expect(url.startsWith('https://api.docflows.uk/storage/local/upload?token=')).toBe(true);
  });

  it('uses API_PUBLIC_URL as the base for download URLs when set', async () => {
    process.env.API_PUBLIC_URL = 'https://api.docflows.uk';
    delete process.env.PORT;
    const backend = new LocalStorageBackend();

    const url = await backend.getDownloadUrl('docs/abc/file.pdf');

    expect(url.startsWith('https://api.docflows.uk/storage/local/download?token=')).toBe(true);
  });

  it('does not fall back to the internal PORT-based localhost URL when API_PUBLIC_URL is set', async () => {
    process.env.API_PUBLIC_URL = 'https://api.docflows.uk';
    process.env.PORT = '8080';
    const backend = new LocalStorageBackend();

    const url = await backend.getUploadUrl('docs/abc/file.pdf', 'application/pdf');

    expect(url).not.toContain('localhost:8080');
  });

  it('falls back to http://localhost:<PORT> only when API_PUBLIC_URL is unset', async () => {
    delete process.env.API_PUBLIC_URL;
    process.env.PORT = '8080';
    const backend = new LocalStorageBackend();

    const url = await backend.getUploadUrl('docs/abc/file.pdf', 'application/pdf');

    expect(url.startsWith('http://localhost:8080/storage/local/upload?token=')).toBe(true);
  });
});
