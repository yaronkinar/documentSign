import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Document, DocumentSchema } from '../documents/document.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvitesService } from './invites.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Document.name, schema: DocumentSchema }]),
    NotificationsModule,
  ],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
