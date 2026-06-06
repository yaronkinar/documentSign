const LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'http://localhost:3100',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3003',
  'http://127.0.0.1:3004',
  'http://127.0.0.1:3005',
  'http://127.0.0.1:3100',
];

/** Allowed browser origins for REST CORS and Socket.io. */
export function getWebOrigins(): string[] {
  const origins = new Set<string>(LOCAL_ORIGINS);

  const webUrl = process.env.WEB_URL?.trim();
  if (webUrl) {
    origins.add(webUrl);
  }

  const extra = process.env.CORS_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  for (const origin of extra ?? []) {
    origins.add(origin);
  }

  return [...origins];
}
