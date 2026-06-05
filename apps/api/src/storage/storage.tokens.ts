import { createHmac, timingSafeEqual } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';

type StorageOp = 'upload' | 'download';

interface StorageTokenPayload {
  key: string;
  op: StorageOp;
  exp: number;
}

function signingSecret(): string {
  return process.env.INVITE_TOKEN_SECRET ?? 'dev-local-storage-secret';
}

export function signStorageToken(key: string, op: StorageOp, ttlSeconds: number): string {
  const payload: StorageTokenPayload = {
    key,
    op,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', signingSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyStorageToken(token: string, op: StorageOp): string {
  const [body, sig] = token.split('.');
  if (!body || !sig) {
    throw new UnauthorizedException('Invalid storage token');
  }
  const expected = createHmac('sha256', signingSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new UnauthorizedException('Invalid storage token');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StorageTokenPayload;
  if (payload.op !== op || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new UnauthorizedException('Storage token expired or invalid');
  }
  if (payload.key.includes('..') || payload.key.startsWith('/')) {
    throw new UnauthorizedException('Invalid storage key');
  }
  return payload.key;
}
