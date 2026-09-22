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
  CreateDeviceSchema,
  DeviceSchema,
  ListDevicesQuerySchema,
  PaginatedDevicesSchema,
  UpdateDeviceSchema,
  type CreateDeviceDto,
  type Device,
  type ListDevicesQuery,
  type Paginated,
  type UpdateDeviceDto,
} from '@gen-ui/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ADMIN_ONLY, ApiErrorResponse, AUTH_REQUIRED } from '../docs/api-error.js';
import type { AuthUser } from '../users/user.mapper.js';
import { DevicesService } from './devices.service.js';

@ApiTags('Devices')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @ApiOperation({
    summary: 'List devices',
    description: '`assetId` includes devices anywhere below that asset. `search` matches name, serial number, model or manufacturer.',
  })
  @ApiOkResponse({ standardSchema: PaginatedDevicesSchema })
  @ApiErrorResponse(400, 'A query parameter is invalid.')
  list(@Query({ schema: ListDevicesQuerySchema }) query: ListDevicesQuery): Promise<Paginated<Device>> {
    return this.devices.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one device' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: DeviceSchema })
  @ApiErrorResponse(404, 'No device with that id.')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Device> {
    return this.devices.get(id);
  }

  @Post()
  @Roles(['ADMIN'])
  @ApiOperation({ summary: 'Register a device' })
  @ApiCreatedResponse({ standardSchema: DeviceSchema })
  @ApiErrorResponse(400, 'A field is invalid, or the asset does not exist.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(409, 'That serial number is already registered.')
  create(@Body({ schema: CreateDeviceSchema }) dto: CreateDeviceDto, @CurrentUser() actor: AuthUser): Promise<Device> {
    return this.devices.create(dto, actor);
  }

  @Patch(':id')
  @Roles(['ADMIN'])
  @ApiOperation({
    summary: 'Update a device',
    description: 'Send only the fields to change. A status change is also written to the logbook.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ standardSchema: DeviceSchema })
  @ApiErrorResponse(400, 'No fields sent, or a field is invalid.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(404, 'No device with that id.')
  @ApiErrorResponse(409, 'That serial number is already registered.')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: UpdateDeviceSchema }) dto: UpdateDeviceDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<Device> {
    return this.devices.update(id, dto, actor);
  }

  @Delete(':id')
  @Roles(['ADMIN'])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a device', description: 'Only a device without tags.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrorResponse(403, ADMIN_ONLY)
  @ApiErrorResponse(404, 'No device with that id.')
  @ApiErrorResponse(409, 'The device still has tags.')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.devices.remove(id, actor);
  }
}
