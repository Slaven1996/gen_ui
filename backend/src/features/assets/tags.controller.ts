import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateTagSchema,
  ListTagsQuerySchema,
  PaginatedTagsSchema,
  TagSchema,
  UpdateTagSchema,
  type CreateTagDto,
  type ListTagsQuery,
  type Paginated,
  type Tag,
  type UpdateTagDto,
} from '@gen-ui/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ADMIN_ONLY, ApiErrorResponse, AUTH_REQUIRED } from '../../docs/api-error.js';
import type { AuthUser } from '../users/user.mapper.js';
import { TagsService } from './tags.service.js';

@ApiTags('Tags')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @ApiOperation({
    summary: 'List tags',
    description:
      'Datapoints with their latest value. `assetId` includes tags on devices anywhere below that asset; `ids` fetches specific tags (e.g. the ones a chart plots).',
  })
  @ApiOkResponse({ standardSchema: PaginatedTagsSchema })
  @ApiErrorResponse(400, 'A query parameter is invalid.')
  list(@Query({ schema: ListTagsQuerySchema }) query: ListTagsQuery): Promise<Paginated<Tag>> {
    return this.tags.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one tag' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: TagSchema })
  @ApiErrorResponse(404, 'No tag with that id.')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Tag> {
    return this.tags.get(id);
  }

  @Post()
  @Roles(['ADMIN'])
  @ApiOperation({ summary: 'Create a tag' })
  @ApiCreatedResponse({ standardSchema: TagSchema })
  @ApiErrorResponse(400, 'A field is invalid, or the device does not exist.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(409, 'The device already has a tag with that code.')
  create(@Body({ schema: CreateTagSchema }) dto: CreateTagDto, @CurrentUser() actor: AuthUser): Promise<Tag> {
    return this.tags.create(dto, actor);
  }

  @Patch(':id')
  @Roles(['ADMIN'])
  @ApiOperation({ summary: 'Update a tag', description: 'Send only the fields to change. A tag cannot move to another device.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: TagSchema })
  @ApiErrorResponse(400, 'No fields sent, a field is invalid, or min is not below max.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(404, 'No tag with that id.')
  @ApiErrorResponse(409, 'The device already has a tag with that code.')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: UpdateTagSchema }) dto: UpdateTagDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<Tag> {
    return this.tags.update(id, dto, actor);
  }

  @Delete(':id')
  @Roles(['ADMIN'])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a tag',
    description: 'Deletes its measurements too. Tags with alarm rules or alarm history are refused — deactivate them instead.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(404, 'No tag with that id.')
  @ApiErrorResponse(409, 'The tag has alarm rules or alarm history.')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.tags.remove(id, actor);
  }
}
