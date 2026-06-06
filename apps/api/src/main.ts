import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { AppModule } from './app.module';
import { getWebOrigins } from './config/web-origins';

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
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap();
