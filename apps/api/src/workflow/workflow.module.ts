import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';

import { Document, DocumentSchema } from '../documents/document.schema';
import { User, UserSchema } from '../users/user.schema';
import { WorkflowService } from './workflow.service';
import { WorkflowGateway } from './workflow.gateway';
import { InvitesModule } from '../invites/invites.module';
import { NOTIFICATIONS_QUEUE } from '../notifications/notifications.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Document.name, schema: DocumentSchema },
      { name: User.name, schema: UserSchema },
    ]),
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
    InvitesModule,
  ],
  providers: [WorkflowService, WorkflowGateway],
  exports: [WorkflowService, WorkflowGateway],
})
export class WorkflowModule {}
