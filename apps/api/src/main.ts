import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { AppModule } from './app.module';
import { getWebOrigins } from './config/web-origins';

const PORT_RETRY_DELAY_MS = 400;
const PORT_RETRY_TIMEOUT_MS = 15_000;

/** Resolves true when nothing is holding the port. */
async function isPortFree(port: number): Promise<boolean> {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port);
  });
}

/**
 * Waits for a previous instance to release the port before binding.
 *
 * In watch mode a rebuild starts the new process before the old one has fully
 * released the port, so listen() throws EADDRINUSE and the restart dies —
 * leaving nothing serving until someone notices and restarts by hand.
 *
 * The wait uses a throwaway probe socket rather than retrying app.listen(),
 * because each failed listen() leaves its handlers attached to the Nest HTTP
 * server and the retries pile up listeners instead of recovering.
 */
async function waitForPort(port: number): Promise<void> {
  const giveUpAt = Date.now() + PORT_RETRY_TIMEOUT_MS;
  let announced = false;

  while (!(await isPortFree(port))) {
    // Out of patience: fall through and let listen() report the real error.
    if (Date.now() >= giveUpAt) return;
    if (!announced) {
      announced = true;
      // eslint-disable-next-line no-console
      console.log(`[api] port ${port} still held, waiting for it to free…`);
    }
    await new Promise((resolve) => setTimeout(resolve, PORT_RETRY_DELAY_MS));
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: '2mb' }));
  app.use(
    '/storage/local/upload',
    express.raw({ type: () => true, limit: '100mb' }),
  );

  app.enableCors({
    origin: getWebOrigins(),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3001);
  await waitForPort(port);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  // Without this the process exits silently and the only clue is a dead port.
  // eslint-disable-next-line no-console
  console.error('[api] failed to start:', err);
  process.exit(1);
});
