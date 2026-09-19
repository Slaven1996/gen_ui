import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  CreateUserSchema,
  ListUsersQuerySchema,
  UpdateUserSchema,
  type CreateUserDto,
  type ListUsersQuery,
  type Paginated,
  type PublicUser,
  type UpdateUserDto,
} from '@gen-ui/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from './user.mapper.js';
import { UsersService } from './users.service.js';

@Controller('users')
@Roles(['ADMIN'])
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query({ schema: ListUsersQuerySchema }) query: ListUsersQuery): Promise<Paginated<PublicUser>> {
    return this.users.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PublicUser> {
    return this.users.get(id);
  }

  @Post()
  create(@Body({ schema: CreateUserSchema }) dto: CreateUserDto): Promise<PublicUser> {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: UpdateUserSchema }) dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<PublicUser> {
    return this.users.update(id, dto, actor);
  }
}
