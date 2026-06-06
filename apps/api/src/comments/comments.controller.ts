import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { CommentsService } from './comments.service';
import { CreateCommentDto, DevTestCommentNotifyDto } from './comments.dto';

@Controller()
@UseGuards(ClerkAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post('documents/:id/comments')
  add(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    return this.commentsService.addComment(
      id,
      dto,
      user.clerkId,
      user.email,
      user.name,
    );
  }

  @Get('documents/:id/comments')
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    return this.commentsService.listComments(id, user.clerkId, user.email);
  }

  @Patch('comments/:id/resolve')
  resolve(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    return this.commentsService.resolveComment(id, user.clerkId, user.email);
  }

  /** Dev-only: preview or send comment notification emails (BYPASS_AUTH=true). */
  @Post('documents/:id/dev/test-comment-notify')
  devTestCommentNotify(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: DevTestCommentNotifyDto,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    return this.commentsService.devTestCommentNotifications(
      id,
      user.clerkId,
      user.email,
      dto,
    );
  }
}
