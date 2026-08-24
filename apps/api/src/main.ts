import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { AppModule } from './app.module';
import { getWebOrigins } from './config/web-origins';

const PORT_RETRY_DELAY_MS = 400;
const PORT_RETRY_TIMEOUT_MS = 30_000;

/**
 * Binds the port, retrying while a previous instance still holds it.
 *
 * In watch mode a rebuild starts the new API before the old process has
 * released port 3001, so listen() throws EADDRINUSE and the restart dies —
 * leaving nothing serving until someone notices the dead port.
 *
 * This retries listen() itself rather than probing the port first: a probe
 * only tells you the port was free a moment ago, and the old process can
 * still be holding it by the time the real bind happens. Retrying the actual
 * bind is the only check that cannot go stale.
 */
async function listenWithRetry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any,
  port: number,
): Promise<void> {
  const giveUpAt = Date.now() + PORT_RETRY_TIMEOUT_MS;
  let waiting = false;

  for (;;) {
    try {
      await app.listen(port);
      if (waiting) {
        // eslint-disable-next-line no-console
        console.log(`[api] port ${port} freed, listening`);
      }
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'EADDRINUSE' || Date.now() >= giveUpAt) throw err;

      if (!waiting) {
        waiting = true;
        // A failed listen() leaves its handlers on the HTTP server, so the
        // retries would otherwise trip Node's listener-leak warning.
        app.getHttpServer?.()?.setMaxListeners?.(0);
        // eslint-disable-next-line no-console
        console.log(`[api] port ${port} still held, waiting for it to free…`);
      }
      await new Promise((resolve) => setTimeout(resolve, PORT_RETRY_DELAY_MS));
    }
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
  await listenWithRetry(app, port);
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  // Without this the process exits silently and the only clue is a dead port.
  // eslint-disable-next-line no-console
  console.error('[api] failed to start:', err);
  process.exit(1);
});
