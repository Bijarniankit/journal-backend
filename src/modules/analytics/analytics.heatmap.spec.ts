import { Test, TestingModule } from '@nestjs/testing';
import { HeatmapService } from './heatmap.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

describe('HeatmapService', () => {
  let service: HeatmapService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HeatmapService,
        {
          provide: PrismaService,
          useValue: {
            profile: { findUnique: jest.fn() },
            trade: { findMany: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<HeatmapService>(HeatmapService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should bucket trades by day and hour', async () => {
    // 2023-10-09 is a Monday
    // 2023-10-09T14:30:00.000Z is 14:30 UTC
    // With America/New_York (UTC-4 in Oct), it is 10:30 AM local on Monday.
    jest.spyOn(prisma.profile, 'findUnique').mockResolvedValue({
      timezone: 'America/New_York',
    } as any);

    jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
      {
        openedAt: new Date('2023-10-09T14:30:00.000Z'),
        netPnlBase: new Prisma.Decimal(100),
      } as any
    ]);

    const result = await service.getHeatmap('u1', 'day', new Date('2020-01-01'), new Date('2030-01-01'));
    
    expect(result.rows).toHaveLength(7); // Sunday-Saturday
    expect(result.cols).toHaveLength(24); // 00-23
    
    // rowIndex 1 is Monday, colIndex 10 is 10:00 AM
    expect(result.cells[1][10]).toBe(100);
    // Spot check other cell
    expect(result.cells[0][0]).toBe(0);
  });

  it('should bucket trades by session', async () => {
    jest.spyOn(prisma.profile, 'findUnique').mockResolvedValue({
      timezone: 'UTC', // Timezone for day of week
    } as any);

    // 2023-10-09 is Monday
    jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
      { // 02:00 UTC -> Asian
        openedAt: new Date('2023-10-09T02:00:00.000Z'),
        netPnlBase: new Prisma.Decimal(10),
      } as any,
      { // 10:00 UTC -> London
        openedAt: new Date('2023-10-09T10:00:00.000Z'),
        netPnlBase: new Prisma.Decimal(20),
      } as any,
      { // 15:00 UTC -> London and NY overlap! Our logic should assign to both!
        openedAt: new Date('2023-10-09T15:00:00.000Z'),
        netPnlBase: new Prisma.Decimal(50),
      } as any,
    ]);

    const result = await service.getHeatmap('u1', 'session', new Date('2020-01-01'), new Date('2030-01-01'));
    
    expect(result.rows[1]).toBe('Monday'); // index 1 is Monday
    expect(result.cols).toEqual(['Asian', 'London', 'New York', 'Other']);
    
    // Monday Asian
    expect(result.cells[1][0]).toBe(10);
    
    // Monday London (10:00 trade + 15:00 trade = 70)
    expect(result.cells[1][1]).toBe(70);
    
    // Monday NY (15:00 trade only = 50)
    expect(result.cells[1][2]).toBe(50);
  });

  it('should bucket trades by strategy', async () => {
    jest.spyOn(prisma.profile, 'findUnique').mockResolvedValue({
      timezone: 'UTC',
    } as any);

    jest.spyOn(prisma.trade, 'findMany').mockResolvedValue([
      { 
        openedAt: new Date('2023-10-09T02:00:00.000Z'), // Monday
        netPnlBase: new Prisma.Decimal(150),
        strategy: { name: 'Breakout' }
      } as any,
      { 
        openedAt: new Date('2023-10-10T02:00:00.000Z'), // Tuesday
        netPnlBase: new Prisma.Decimal(50),
        strategy: { name: 'Reversion' }
      } as any,
    ]);

    const result = await service.getHeatmap('u1', 'strategy', new Date('2020-01-01'), new Date('2030-01-01'));
    
    // Alphabetical sort of strategies
    expect(result.rows).toEqual(['Breakout', 'Reversion']);
    
    // Breakout on Monday (index 1)
    expect(result.cells[0][1]).toBe(150);
    // Breakout on Tuesday (index 2)
    expect(result.cells[0][2]).toBe(0);
    
    // Reversion on Monday
    expect(result.cells[1][1]).toBe(0);
    // Reversion on Tuesday
    expect(result.cells[1][2]).toBe(50);
  });
});
