import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

// Helper to build a mock trade row matching the select shape
function mockTrade(
  netPnlBase: number | null,
  plannedRiskReward: number | null = null,
  closedAt: Date | null = new Date('2024-01-15'),
) {
  return {
    netPnlBase: netPnlBase !== null ? new Decimal(netPnlBase) : null,
    plannedRiskReward:
      plannedRiskReward !== null ? new Decimal(plannedRiskReward) : null,
    closedAt,
  };
}

describe('AnalyticsService - getPerformanceMetrics', () => {
  let service: AnalyticsService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      trade: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  const from = new Date('2024-01-01');
  const to = new Date('2024-12-31');

  // ─── Zero Trades ──────────────────────────────────────────
  it('should return zeroed metrics when there are no trades', async () => {
    mockPrisma.trade.findMany.mockResolvedValue([]);

    const result = await service.getPerformanceMetrics('user1', from, to);

    expect(result.totalClosedTrades).toBe(0);
    expect(result.winRate).toBe(0);
    expect(result.profitFactor).toBeNull();
    expect(result.expectancy).toBe(0);
    expect(result.avgWin).toBe(0);
    expect(result.avgLoss).toBe(0);
    expect(result.largestWin).toBe(0);
    expect(result.largestLoss).toBe(0);
    expect(result.avgPlannedRiskReward).toBeNull();
    expect(result.tradesWithPlannedRR).toBe(0);
    expect(result.consecutiveWins).toBe(0);
    expect(result.consecutiveLosses).toBe(0);
  });

  // ─── All Wins ─────────────────────────────────────────────
  it('should correctly compute metrics when all trades are wins', async () => {
    mockPrisma.trade.findMany.mockResolvedValue([
      mockTrade(100),
      mockTrade(200),
      mockTrade(50),
    ]);

    const result = await service.getPerformanceMetrics('user1', from, to);

    expect(result.totalClosedTrades).toBe(3);
    expect(result.winRate).toBe(1);
    expect(result.profitFactor).toBeNull(); // no losses -> null
    expect(result.avgWin).toBeCloseTo(116.67, 1);
    expect(result.avgLoss).toBe(0);
    expect(result.largestWin).toBe(200);
    expect(result.largestLoss).toBe(0);
    expect(result.consecutiveWins).toBe(3);
    expect(result.consecutiveLosses).toBe(0);
  });

  // ─── All Losses ───────────────────────────────────────────
  it('should correctly compute metrics when all trades are losses', async () => {
    mockPrisma.trade.findMany.mockResolvedValue([
      mockTrade(-50),
      mockTrade(-100),
      mockTrade(-25),
    ]);

    const result = await service.getPerformanceMetrics('user1', from, to);

    expect(result.totalClosedTrades).toBe(3);
    expect(result.winRate).toBe(0);
    expect(result.profitFactor).toBe(0); // 0 wins / losses = 0
    expect(result.avgWin).toBe(0);
    expect(result.avgLoss).toBeCloseTo(58.33, 1);
    expect(result.largestLoss).toBe(-100);
    expect(result.consecutiveWins).toBe(0);
    expect(result.consecutiveLosses).toBe(3);
  });

  // ─── Mixed Wins & Losses ──────────────────────────────────
  it('should correctly compute metrics for a mixed win/loss set', async () => {
    // 4 trades: W(+200), L(-50), W(+100), L(-50)
    mockPrisma.trade.findMany.mockResolvedValue([
      mockTrade(200),  // Win
      mockTrade(-50),  // Loss
      mockTrade(100),  // Win
      mockTrade(-50),  // Loss
    ]);

    const result = await service.getPerformanceMetrics('user1', from, to);

    expect(result.totalClosedTrades).toBe(4);
    // winRate = 2/4 = 0.5
    expect(result.winRate).toBe(0.5);
    // profitFactor = 300 / 100 = 3.0
    expect(result.profitFactor).toBe(3.0);
    // avgWin = 300/2 = 150, avgLoss = 100/2 = 50
    expect(result.avgWin).toBe(150);
    expect(result.avgLoss).toBe(50);
    // expectancy = (0.5 * 150) - (0.5 * 50) = 75 - 25 = 50
    expect(result.expectancy).toBe(50);
    expect(result.largestWin).toBe(200);
    expect(result.largestLoss).toBe(-50);
    // Streaks: W, L, W, L -> max win streak = 1, max loss streak = 1
    expect(result.consecutiveWins).toBe(1);
    expect(result.consecutiveLosses).toBe(1);
  });

  // ─── Streak Detection ─────────────────────────────────────
  it('should correctly detect longest win and loss streaks', async () => {
    // Sequence: W, W, W, L, L, W, L, L, L, L, W
    mockPrisma.trade.findMany.mockResolvedValue([
      mockTrade(10),   // W
      mockTrade(20),   // W
      mockTrade(30),   // W  -> win streak = 3
      mockTrade(-10),  // L
      mockTrade(-20),  // L  -> loss streak = 2
      mockTrade(5),    // W
      mockTrade(-5),   // L
      mockTrade(-15),  // L
      mockTrade(-25),  // L
      mockTrade(-35),  // L  -> loss streak = 4
      mockTrade(40),   // W
    ]);

    const result = await service.getPerformanceMetrics('user1', from, to);

    expect(result.consecutiveWins).toBe(3);
    expect(result.consecutiveLosses).toBe(4);
  });

  // ─── Breakeven (pnl === 0) Resets Streaks ─────────────────
  it('should reset both streaks on a breakeven trade', async () => {
    // W, W, BE(0), W -> max win streak = 2 (not 3)
    mockPrisma.trade.findMany.mockResolvedValue([
      mockTrade(10),  // W
      mockTrade(20),  // W -> streak = 2
      mockTrade(0),   // Breakeven -> resets
      mockTrade(30),  // W -> streak = 1
    ]);

    const result = await service.getPerformanceMetrics('user1', from, to);

    expect(result.consecutiveWins).toBe(2);
    expect(result.consecutiveLosses).toBe(0);
  });

  // ─── Planned Risk:Reward with Partial Data ────────────────
  it('should compute avgPlannedRR only over trades that have it set', async () => {
    mockPrisma.trade.findMany.mockResolvedValue([
      mockTrade(100, 2.0),   // RR = 2.0
      mockTrade(-50, null),  // No RR set
      mockTrade(75, 3.0),    // RR = 3.0
      mockTrade(25, null),   // No RR set
    ]);

    const result = await service.getPerformanceMetrics('user1', from, to);

    // Only 2 trades have RR, avg = (2.0 + 3.0) / 2 = 2.5
    expect(result.avgPlannedRiskReward).toBe(2.5);
    expect(result.tradesWithPlannedRR).toBe(2);
  });

  // ─── Profit Factor Edge: Single Win, Zero Loss ────────────
  it('should return null profitFactor when there are no losses', async () => {
    mockPrisma.trade.findMany.mockResolvedValue([mockTrade(500)]);

    const result = await service.getPerformanceMetrics('user1', from, to);

    expect(result.profitFactor).toBeNull();
  });

  // ─── includeOpen filter ───────────────────────────────────
  it('should pass includeOpen=false filter to query (default)', async () => {
    mockPrisma.trade.findMany.mockResolvedValue([]);

    await service.getPerformanceMetrics('user1', from, to, false);

    expect(mockPrisma.trade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          closedAt: { not: null },
          netPnlBase: { not: null },
        }),
      }),
    );
  });

  it('should NOT add closedAt filter when includeOpen=true', async () => {
    mockPrisma.trade.findMany.mockResolvedValue([]);

    await service.getPerformanceMetrics('user1', from, to, true);

    const calledWith = mockPrisma.trade.findMany.mock.calls[0][0];
    expect(calledWith.where.closedAt).toBeUndefined();
    expect(calledWith.where.netPnlBase).toBeUndefined();
  });
});
