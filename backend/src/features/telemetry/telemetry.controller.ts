import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IngestMeasurementsSchema,
  IngestResultSchema,
  TelemetrySeriesQuerySchema,
  TelemetrySeriesSchema,
  TelemetryStatsQuerySchema,
  TelemetryStatsSchema,
  type IngestMeasurementsDto,
  type IngestResult,
  type TagStats,
  type TelemetrySeries,
  type TelemetrySeriesQuery,
  type TelemetryStatsQuery,
} from '@gen-ui/shared';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ADMIN_ONLY, ApiErrorResponse, AUTH_REQUIRED } from '../../docs/api-error.js';
import { TelemetryService } from './telemetry.service.js';

@ApiTags('Telemetry')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Get('series')
  @ApiOperation({
    summary: 'Time series for charts',
    description:
      'Readings of up to 8 tags, bucketed and aggregated in the database. `interval=auto` picks the finest bucket that keeps each series under 400 points; the response says which one it used. Series come back in the order of `tagIds`; unknown ids are left out. Without `tagIds` the answer is an empty list.',
  })
  @ApiOkResponse({ standardSchema: TelemetrySeriesSchema })
  @ApiErrorResponse(400, 'A parameter is invalid, the interval is too fine for the range, or `from` is not before `to`.')
  series(@Query({ schema: TelemetrySeriesQuerySchema }) query: TelemetrySeriesQuery): Promise<TelemetrySeries> {
    return this.telemetry.series(query);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Summary statistics per tag',
    description: 'Count, min, max, mean, first and last reading of each tag in the window. Tags without readings come back with `count: 0`.',
  })
  @ApiOkResponse({ standardSchema: TelemetryStatsSchema })
  @ApiErrorResponse(400, 'A parameter is invalid, or `from` is not before `to`.')
  async stats(@Query({ schema: TelemetryStatsQuerySchema }) query: TelemetryStatsQuery): Promise<{ items: TagStats[] }> {
    return { items: await this.telemetry.stats(query) };
  }

  @Post('measurements')
  @Roles(['ADMIN'])
  @ApiOperation({
    summary: 'Ingest readings',
    description:
      'Up to 1000 readings per call, from a gateway or an import. Stores them (duplicates of an existing tag + timestamp are skipped), updates each tag’s latest value, marks reporting devices online and evaluates alarm rules against readings newer than the tag’s previous value.',
  })
  @ApiCreatedResponse({ standardSchema: IngestResultSchema })
  @ApiErrorResponse(400, 'A reading is invalid, or a tag does not exist.')
  @ApiErrorResponse(403, ADMIN_ONLY)
  ingest(@Body({ schema: IngestMeasurementsSchema }) dto: IngestMeasurementsDto): Promise<IngestResult> {
    return this.telemetry.ingest(dto);
  }
}
