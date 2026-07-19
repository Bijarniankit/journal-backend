import { Test, TestingModule } from '@nestjs/testing';
import { GroupByDimensionService } from './group-by-dimension.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { BadRequestException } from '@nestjs/common';

describe('GroupByDimensionService', () => {
  let service: GroupByDimensionService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupByDimensionService,
        {
          provide: PrismaService,
          useValue: {
            trade: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<GroupByDimensionService>(GroupByDimensionService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('group by strategy', () => {
    it('should accurately group by strategy and calculate win rates', async () => {
      const mockTrades = [
        {
          strategyId: 'strat1',
          strategy: { name: 'Breakout' },
          netPnlBase: new Decimal('100'),
        },
        {
          strategyId: 'strat1',
          strategy: { name: 'Breakout' },
          netPnlBase: new Decimal('-50'),
        },
        {
          strategyId: 'strat2',
          strategy: { name: 'Mean Reversion' },
          netPnlBase: new Decimal('200'),
        },
        {
          strategyId: null,
          strategy: null,
          netPnlBase: new Decimal('50'),
        },
      ];

      (prisma.trade.findMany as jest.Mock).mockResolvedValue(mockTrades);

      const result = await service.group(
        'user1',
        'strategy',
        new Date('2023-01-01'),
        new Date('2023-12-31')
      );

      expect(prisma.trade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user1',
            closedAt: { not: null },
            netPnlBase: { not: null },
          }),
        })
      );

      // Should sort by netPnl descending
      expect(result).toHaveLength(3);
      
      expect(result[0]).toEqual({
        key: 'strat2',
        label: 'Mean Reversion',
        tradesCount: 1,
        winRate: 1, // 1/1 wins
        netPnl: 200,
      });

      expect(result[1]).toEqual({
        key: 'strat1',
        label: 'Breakout',
        tradesCount: 2,
        winRate: 0.5, // 1/2 wins
        netPnl: 50,
      });

      expect(result[2]).toEqual({
        key: 'unassigned',
        label: 'Unassigned',
        tradesCount: 1,
        winRate: 1, // 1/1 wins
        netPnl: 50,
      });
    });
  });

  describe('group by tag', () => {
    it('should accurately group by tag distributing PnL across multiple tags', async () => {
      const mockTrades = [
        {
          netPnlBase: new Decimal('100'),
          tags: [
            { tag: { id: 'tag1', name: 'FOMO' } },
            { tag: { id: 'tag2', name: 'Revenge' } },
          ],
        },
        {
          netPnlBase: new Decimal('-50'),
          tags: [
            { tag: { id: 'tag1', name: 'FOMO' } },
          ],
        },
        {
          netPnlBase: new Decimal('20'),
          tags: [], // Unassigned tag
        },
      ];

      (prisma.trade.findMany as jest.Mock).mockResolvedValue(mockTrades);

      const result = await service.group(
        'user1',
        'tag',
        new Date('2023-01-01'),
        new Date('2023-12-31')
      );

      expect(result).toHaveLength(3);
      
      // FOMO: 1 win (100), 1 loss (-50) -> netPnl: 50, tradesCount: 2, winRate: 0.5
      // Revenge: 1 win (100) -> netPnl: 100, tradesCount: 1, winRate: 1
      // Unassigned: 1 win (20) -> netPnl: 20, tradesCount: 1, winRate: 1
      
      expect(result).toContainEqual({
        key: 'tag2',
        label: 'Revenge',
        tradesCount: 1,
        winRate: 1,
        netPnl: 100,
      });

      expect(result).toContainEqual({
        key: 'tag1',
        label: 'FOMO',
        tradesCount: 2,
        winRate: 0.5,
        netPnl: 50,
      });

      expect(result).toContainEqual({
        key: 'unassigned',
        label: 'Unassigned',
        tradesCount: 1,
        winRate: 1,
        netPnl: 20,
      });
    });
  });

  describe('error handling', () => {
    it('should throw BadRequestException for unknown dimension', async () => {
      await expect(
        service.group('user1', 'unknown' as any, new Date(), new Date())
      ).rejects.toThrow(BadRequestException);
    });
  });
});
