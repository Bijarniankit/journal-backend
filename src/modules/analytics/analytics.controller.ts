import { Controller, Get, Query, Request } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { RangeResolverService } from './range-resolver.service';
import { RangeQueryDto } from '../../shared/dto/range.schema';
import { PrismaService } from '../../prisma/prisma.service';

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
  async getSummary(@Request() req: any, @Query() query: RangeQueryDto) {
    const { from, to } = await this.getBounds(req.user.id, query);
    return this.analyticsService.getSummary(req.user.id, from, to);
  }

  @Get('equity')
  async getEquity(@Request() req: any, @Query() query: RangeQueryDto) {
    const { from, to } = await this.getBounds(req.user.id, query);
    return this.analyticsService.getEquity(req.user.id, from, to);
  }

  @Get('drawdown')
  async getDrawdown(@Request() req: any, @Query() query: RangeQueryDto) {
    const { from, to } = await this.getBounds(req.user.id, query);
    return this.analyticsService.getDrawdown(req.user.id, from, to);
  }
}

