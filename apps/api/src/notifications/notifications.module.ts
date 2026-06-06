import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';

import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import {
  UserNotification,
  UserNotificationSchema,
} from './user-notification.schema';
import { UserNotificationsService } from './user-notifications.service';
import { UserNotificationsController } from './user-notifications.controller';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
    MongooseModule.forFeature([
      { name: UserNotification.name, schema: UserNotificationSchema },
    ]),
  ],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    UserNotificationsService,
  ],
  controllers: [UserNotificationsController],
  exports: [BullModule, NotificationsService, UserNotificationsService],
})
export class NotificationsModule {}
