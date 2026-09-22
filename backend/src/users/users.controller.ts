import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateUserSchema,
  ListUsersQuerySchema,
  PaginatedUsersSchema,
  PublicUserSchema,
  UpdateUserSchema,
  UserOptionsSchema,
  type CreateUserDto,
  type ListUsersQuery,
  type Paginated,
  type PublicUser,
  type UpdateUserDto,
  type UserRef,
} from '@gen-ui/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ADMIN_ONLY, ApiErrorResponse, AUTH_REQUIRED } from '../docs/api-error.js';
import type { AuthUser } from './user.mapper.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@ApiErrorResponse(403, ADMIN_ONLY)
@Controller('users')
@Roles(['ADMIN'])
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List users',
    description:
      '`search` matches email or name, case-insensitively, anywhere in the value. Results are one page at a time; `total` counts every match.',
  })
  @ApiOkResponse({ standardSchema: PaginatedUsersSchema })
  @ApiErrorResponse(400, 'A query parameter is out of range, e.g. `pageSize` above 100.')
  list(@Query({ schema: ListUsersQuerySchema }) query: ListUsersQuery): Promise<Paginated<PublicUser>> {
    return this.users.list(query);
  }

  // Declared before `:id` so "options" is not taken for an id.
  @Get('options')
  @Roles(['ADMIN', 'USER'])
  @ApiOperation({
    summary: 'Active users for pickers',
    description:
      'Id and name of every active account, by name — for choosing people in shift plans and filters. Open to every signed-in user; carries nothing beyond names.',
  })
  @ApiOkResponse({ standardSchema: UserOptionsSchema })
  async options(): Promise<{ items: UserRef[] }> {
    return { items: await this.users.options() };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one user',
    description: 'The same payload the list returns, for a single id.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: PublicUserSchema })
  @ApiErrorResponse(400, '`id` is not a UUID.')
  @ApiErrorResponse(404, 'No user with that id.')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PublicUser> {
    return this.users.get(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a user',
    description: 'The only way an account comes into existence — the app has no public sign-up.',
  })
  @ApiCreatedResponse({ standardSchema: PublicUserSchema })
  @ApiErrorResponse(400, 'A field is missing or invalid, e.g. a password under 12 characters.')
  @ApiErrorResponse(409, 'That email is already taken.')
  create(@Body({ schema: CreateUserSchema }) dto: CreateUserDto, @CurrentUser() actor: AuthUser): Promise<PublicUser> {
    return this.users.create(dto, actor);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a user',
    description:
      'Send only the fields to change. Demoting or deactivating an account revokes its refresh tokens in the same transaction, so its sessions end at once. Email and password are not editable here; a user changes their own password at `POST /api/profile/password`.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: PublicUserSchema })
  @ApiErrorResponse(400, 'No fields sent, or one of them is invalid.')
  @ApiErrorResponse(403, `${ADMIN_ONLY} Also returned when an admin demotes or deactivates their own account.`)
  @ApiErrorResponse(404, 'No user with that id.')
  @ApiErrorResponse(409, 'The change would leave the system with no active admin.')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: UpdateUserSchema }) dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<PublicUser> {
    return this.users.update(id, dto, actor);
  }
}
