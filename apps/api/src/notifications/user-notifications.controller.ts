import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { UserNotificationsService } from './user-notifications.service';

@Controller('user-notifications')
@UseGuards(ClerkAuthGuard)
export class UserNotificationsController {
  constructor(
    private readonly userNotifications: UserNotificationsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit') limit?: string,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    const parsedLimit = limit ? Number(limit) : 30;
    return this.userNotifications.listForUser(
      user.clerkId,
      user.email,
      Number.isFinite(parsedLimit) ? parsedLimit : 30,
    );
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: CurrentUserPayload) {
    if (!user.email) throw new BadRequestException('No email on token');
    return this.userNotifications
      .getUnreadCount(user.clerkId, user.email)
      .then((count) => ({ count }));
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: CurrentUserPayload) {
    if (!user.email) throw new BadRequestException('No email on token');
    return this.userNotifications
      .markAllRead(user.clerkId, user.email)
      .then((updated) => ({ updated }));
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    if (!user.email) throw new BadRequestException('No email on token');
    return this.userNotifications.markRead(id, user.clerkId, user.email);
  }
}
