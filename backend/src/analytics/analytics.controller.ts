import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AlarmTrendQuerySchema,
  AlarmTrendSchema,
  AnalyticsScopeQuerySchema,
  AnalyticsSummarySchema,
  TopAlarmsQuerySchema,
  TopAlarmsSchema,
  type AlarmTrend,
  type AlarmTrendQuery,
  type AnalyticsScopeQuery,
  type AnalyticsSummary,
  type TopAlarmsItem,
  type TopAlarmsQuery,
} from '@gen-ui/shared';
import { ApiErrorResponse, AUTH_REQUIRED } from '../docs/api-error.js';
import { AnalyticsService } from './analytics.service.js';

@ApiTags('Analytics')
@ApiBearerAuth('access-token')
@ApiErrorResponse(401, AUTH_REQUIRED)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Headline figures',
    description:
      'Counts of assets, tags and devices by status; open alarms by state and severity; alarms raised in the last 24 hours; and the mean time to acknowledge over the last 7 days. `assetId` scopes every figure to that part of the tree.',
  })
  @ApiOkResponse({ standardSchema: AnalyticsSummarySchema })
  summary(@Query({ schema: AnalyticsScopeQuerySchema }) query: AnalyticsScopeQuery): Promise<AnalyticsSummary> {
    return this.analytics.summary(query);
  }

  @Get('alarm-trend')
  @ApiOperation({
    summary: 'Alarms raised over time',
    description:
      'One bucket per hour, day or week — empty buckets included — with a total and a count per severity. Buckets start at local midnight (or local week start, Monday) in `timeZone`.',
  })
  @ApiOkResponse({ standardSchema: AlarmTrendSchema })
  @ApiErrorResponse(400, 'A parameter is invalid, the time zone is unknown, or `from` is not before `to`.')
  alarmTrend(@Query({ schema: AlarmTrendQuerySchema }) query: AlarmTrendQuery): Promise<AlarmTrend> {
    return this.analytics.alarmTrend(query);
  }

  @Get('top-alarms')
  @ApiOperation({
    summary: 'Most frequent alarms',
    description: 'The rules — or with `groupBy=asset`, the assets — that raised the most alarms in the window. The usual first step in reducing alarm load.',
  })
  @ApiOkResponse({ standardSchema: TopAlarmsSchema })
  @ApiErrorResponse(400, 'A parameter is invalid, or `from` is not before `to`.')
  async topAlarms(@Query({ schema: TopAlarmsQuerySchema }) query: TopAlarmsQuery): Promise<{ items: TopAlarmsItem[] }> {
    return { items: await this.analytics.topAlarms(query) };
  }
}
