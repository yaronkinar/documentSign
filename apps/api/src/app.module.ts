import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { existsSync } from 'fs';
import { join } from 'path';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';

import { StorageModule } from './storage/storage.module';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import { SignerProfilesModule } from './signer-profiles/signer-profiles.module';
import { DocumentsModule } from './documents/documents.module';
import { WorkflowModule } from './workflow/workflow.module';
import { InvitesModule } from './invites/invites.module';
import { SignaturesModule } from './signatures/signatures.module';
import { CommentsModule } from './comments/comments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';

function resolveEnvFilePath(): string | undefined {
  const candidates = [
    join(process.cwd(), 'apps/api/.env'),
    join(process.cwd(), '.env'),
    join(__dirname, '..', '.env'),
    join(__dirname, '../../.env'),
  ];
  return candidates.find((path) => existsSync(path));
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFilePath(),
    }),
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/docflow',
      }),
    }),
    BullModule.forRootAsync({
      useFactory: () => {
        const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
          },
        };
      },
    }),
    AuthModule,
    StorageModule,
    AuditModule,
    UsersModule,
    SignerProfilesModule,
    DocumentsModule,
    WorkflowModule,
    InvitesModule,
    SignaturesModule,
    CommentsModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
