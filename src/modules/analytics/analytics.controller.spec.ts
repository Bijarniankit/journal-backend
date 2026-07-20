import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { RangeResolverService } from './range-resolver.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GroupByDimensionService } from './group-by-dimension.service';
import { HeatmapService } from './heatmap.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;

  const mockDimensionService = {
    group: jest.fn(),
  };

  const mockHeatmapService = {
    getHeatmap: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: {} },
        { provide: RangeResolverService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: GroupByDimensionService, useValue: mockDimensionService },
        { provide: HeatmapService, useValue: mockHeatmapService },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
