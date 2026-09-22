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
  AssetDetailSchema,
  AssetTreeSchema,
  CreateAssetSchema,
  ListAssetsQuerySchema,
  PaginatedAssetsSchema,
  UpdateAssetSchema,
  type Asset,
  type AssetDetail,
  type AssetTreeNode,
  type CreateAssetDto,
  type ListAssetsQuery,
  type Paginated,
  type UpdateAssetDto,
} from '@gen-ui/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ADMIN_ONLY, ApiErrorResponse, AUTH_REQUIRED } from '../docs/api-error.js';
import type { AuthUser } from '../users/user.mapper.js';
import { AssetsService } from './assets.service.js';

@ApiTags('Assets')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @ApiOperation({
    summary: 'List assets',
    description:
      'A flat, paginated view of the asset tree. `parentId` gives the direct children of one asset; `ancestorId` gives an asset and everything below it, at any depth.',
  })
  @ApiOkResponse({ standardSchema: PaginatedAssetsSchema })
  @ApiErrorResponse(400, 'A query parameter is invalid.')
  list(@Query({ schema: ListAssetsQuerySchema }) query: ListAssetsQuery): Promise<Paginated<Asset>> {
    return this.assets.list(query);
  }

  @Get('tree')
  @ApiOperation({
    summary: 'The whole asset tree',
    description:
      'Every asset in depth-first order (parents before children, siblings by name) with its depth, and the open alarms of its whole subtree. Build the nested tree client-side from `parentId`.',
  })
  @ApiOkResponse({ standardSchema: AssetTreeSchema })
  async tree(): Promise<{ items: AssetTreeNode[] }> {
    return { items: await this.assets.tree() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one asset', description: 'Includes `ancestors`, root first, for breadcrumbs.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: AssetDetailSchema })
  @ApiErrorResponse(404, 'No asset with that id.')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AssetDetail> {
    return this.assets.get(id);
  }

  @Post()
  @Roles(['ADMIN'])
  @ApiOperation({ summary: 'Create an asset', description: 'Omit `parentId` for a new root.' })
  @ApiCreatedResponse({ standardSchema: AssetDetailSchema })
  @ApiErrorResponse(400, 'A field is invalid, or the parent does not exist.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(409, 'That code is already taken.')
  create(@Body({ schema: CreateAssetSchema }) dto: CreateAssetDto, @CurrentUser() actor: AuthUser): Promise<AssetDetail> {
    return this.assets.create(dto, actor);
  }

  @Patch(':id')
  @Roles(['ADMIN'])
  @ApiOperation({
    summary: 'Update or move an asset',
    description: 'Send only the fields to change. A new `parentId` moves the asset with its whole subtree.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: AssetDetailSchema })
  @ApiErrorResponse(400, 'No fields sent, a field is invalid, or the move would put the asset below itself.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(404, 'No asset with that id.')
  @ApiErrorResponse(409, 'That code is already taken.')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: UpdateAssetSchema }) dto: UpdateAssetDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<AssetDetail> {
    return this.assets.update(id, dto, actor);
  }

  @Delete(':id')
  @Roles(['ADMIN'])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an asset', description: 'Only an asset with no child assets and no devices.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(404, 'No asset with that id.')
  @ApiErrorResponse(409, 'The asset still has children or devices.')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.assets.remove(id, actor);
  }
}
