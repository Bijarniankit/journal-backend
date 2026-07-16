import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { RangeResolverService } from './range-resolver.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: {} },
        { provide: RangeResolverService, useValue: {} },
        { provide: PrismaService, useValue: {} }
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
