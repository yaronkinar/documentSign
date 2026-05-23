import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ClerkAuthGuard } from './clerk.guard';
import { InviteGuard } from './invite.guard';
import { AnyAuthGuard } from './any-auth.guard';
import { ClerkWebhookController } from './clerk-webhook.controller';
import { Document, DocumentSchema } from '../documents/document.schema';
import { UsersModule } from '../users/users.module';

@Global()
@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([{ name: Document.name, schema: DocumentSchema }]),
  ],
  providers: [ClerkAuthGuard, InviteGuard, AnyAuthGuard],
  controllers: [ClerkWebhookController],
  exports: [UsersModule, ClerkAuthGuard, InviteGuard, AnyAuthGuard],
})
export class AuthModule {}
