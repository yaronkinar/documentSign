import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';

@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE })],
  providers: [NotificationsService, NotificationsProcessor],
  exports: [BullModule, NotificationsService],
})
export class NotificationsModule {}
