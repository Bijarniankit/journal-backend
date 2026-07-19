import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { RangeResolverService } from './range-resolver.service';
import { GroupByDimensionService } from './group-by-dimension.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, RangeResolverService, GroupByDimensionService],
  exports: [GroupByDimensionService],
})
export class AnalyticsModule {}
