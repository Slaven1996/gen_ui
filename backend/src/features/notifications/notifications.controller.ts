import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  ListNotificationsQuerySchema,
  MarkNotificationsReadSchema,
  NotificationListSchema,
  type ListNotificationsQuery,
  type MarkNotificationsReadDto,
  type NotificationList,
} from '@gen-ui/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiErrorResponse, AUTH_REQUIRED } from '../../docs/api-error.js';
import type { AuthUser } from '../users/user.mapper.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Your notifications',
    description:
      'Your own inbox, newest first: every alarm a reading raised while your account was active (and, with MOCK_ALARM_NOTIFICATIONS on, made-up demo alarms marked `demo`). `unread` counts all your unread ones, whatever the filter and page. New ones also arrive over the notifications socket (namespace `/notifications`, path `/api/socket.io`) the moment they are stored. Kept for NOTIFICATION_RETENTION_DAYS.',
  })
  @ApiOkResponse({ standardSchema: NotificationListSchema })
  @ApiErrorResponse(400, 'A query parameter is invalid.')
  list(
    @Query({ schema: ListNotificationsQuerySchema }) query: ListNotificationsQuery,
    @CurrentUser() user: AuthUser,
  ): Promise<NotificationList> {
    return this.notifications.list(user.id, query);
  }

  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Mark notifications read',
    description:
      'Marks up to 100 of yours read by `ids`, or every unread one when the body is `{}`. Ones already read, and ids that are not yours, are left alone.',
  })
  @ApiNoContentResponse({ description: 'Marked, or there was nothing to mark.' })
  @ApiErrorResponse(400, '`ids` is empty, has more than 100, or an id is not a UUID.')
  markRead(
    @Body({ schema: MarkNotificationsReadSchema }) dto: MarkNotificationsReadDto,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.notifications.markRead(user.id, dto.ids);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Dismiss a notification',
    description: 'Deletes one of yours for good. An unknown id, or someone else’s, is not an error: there is nothing of yours to delete.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted, or there was nothing to delete.' })
  @ApiErrorResponse(400, '`id` is not a UUID.')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.notifications.remove(user.id, id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear your notifications', description: 'Deletes every notification in your inbox, read or not.' })
  @ApiNoContentResponse({ description: 'Your inbox is empty.' })
  clear(@CurrentUser() user: AuthUser): Promise<void> {
    return this.notifications.clear(user.id);
  }
}
