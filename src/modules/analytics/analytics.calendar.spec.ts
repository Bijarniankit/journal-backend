import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

describe('AnalyticsService - Calendar', () => {
  let service: AnalyticsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: PrismaService,
          useValue: {
            dailySummary: {
              findMany: jest.fn(),
            },
            profile: {
              findUnique: jest.fn(),
            }
          },
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should return mapped calendar data', async () => {
    const mockDailySummaries = [
      {
        userId: 'user1',
        date: new Date('2023-08-01T00:00:00Z'),
        tradesCount: 2,
        netPnl: new Decimal('150.50'),
      },
      {
        userId: 'user1',
        date: new Date('2023-08-02T00:00:00Z'),
        tradesCount: 1,
        netPnl: new Decimal('-50.00'),
      },
    ];

    (prisma.dailySummary.findMany as jest.Mock).mockResolvedValue(mockDailySummaries);

    const result = await service.getCalendar(
      'user1',
      new Date('2023-08-01T00:00:00Z'),
      new Date('2023-08-31T23:59:59Z')
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: '2023-08-01',
      netPnl: 150.50,
      tradesCount: 2,
    });
    expect(result[1]).toEqual({
      date: '2023-08-02',
      netPnl: -50,
      tradesCount: 1,
    });
  });
});
