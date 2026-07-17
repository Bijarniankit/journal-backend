import { Controller, Get, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { RangeResolverService } from './range-resolver.service';
import { RangeQueryDto } from '../../shared/dto/range.schema';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Analytics')
@ApiBearerAuth('supabase-jwt')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly rangeResolver: RangeResolverService,
    private readonly prisma: PrismaService,
  ) {}

  private async getBounds(userId: string, query: RangeQueryDto) {
    const profile = await this.prisma.profile.findUnique({ where: { id: userId } });
    const tz = profile?.timezone || 'UTC';
    return this.rangeResolver.resolve(query, tz);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'P&L overview summary',
    description: 'Returns aggregated P&L tiles for the dashboard: totalNetPnl, tradeCount, winCount, lossCount, and daily breakdown. All values in base currency. Supports range presets (today, this_week, etc.) or explicit from/to dates.',
  })
  async getSummary(@Request() req: any, @Query() query: RangeQueryDto) {
    const { from, to } = await this.getBounds(req.user.id, query);
    return this.analyticsService.getSummary(req.user.id, from, to);
  }

  @Get('equity')
  @ApiOperation({
    summary: 'Equity curve',
    description: 'Returns a time-series of cumulative equity: [{ date, equity }]. Equity = Profile.startingBalance + cumulative realized P&L (computed via SQL window function over DailySummary). Inserting a back-dated trade correctly updates all later days.',
  })
  async getEquity(@Request() req: any, @Query() query: RangeQueryDto) {
    const { from, to } = await this.getBounds(req.user.id, query);
    return this.analyticsService.getEquity(req.user.id, from, to);
  }

  @Get('drawdown')
  @ApiOperation({
    summary: 'Drawdown curve',
    description: 'Returns a time-series of peak-to-current drawdown: [{ date, drawdown }]. Computed via SQL window function: running peak equity minus current equity.',
  })
  async getDrawdown(@Request() req: any, @Query() query: RangeQueryDto) {
    const { from, to } = await this.getBounds(req.user.id, query);
    return this.analyticsService.getDrawdown(req.user.id, from, to);
  }

  @Get('performance')
  @ApiOperation({
    summary: 'Performance metrics',
    description: 'Returns statistical trading performance: winRate, profitFactor, expectancy, avgWin, avgLoss, largestWin, largestLoss, avgPlannedRiskReward (with sample size), and consecutive win/loss streaks. All monetary values in base currency. Defaults to closed trades only; set includeOpen=true to include open positions.',
  })
  @ApiQuery({
    name: 'includeOpen',
    required: false,
    type: String,
    description: 'Set to "true" to include open/active trades in calculations. Defaults to closed trades only.',
    example: 'false',
  })
  async getPerformance(
    @Request() req: any,
    @Query() query: RangeQueryDto,
    @Query('includeOpen') includeOpen?: string,
  ) {
    const { from, to } = await this.getBounds(req.user.id, query);
    const includeOpenBool = includeOpen === 'true';
    return this.analyticsService.getPerformanceMetrics(
      req.user.id,
      from,
      to,
      includeOpenBool,
    );
  }
}
