import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getSummary(userId: string, from: Date, to: Date) {
    const trades = await this.prisma.trade.findMany({
      where: {
        userId,
        openedAt: {
          gte: from,
          lte: to,
        },
      },
      select: {
        netPnlBase: true,
      }
    });

    let totalNetPnl = 0;
    let winCount = 0;
    let lossCount = 0;
    const tradeCount = trades.length;

    for (const t of trades) {
      if (t.netPnlBase) {
        const val = t.netPnlBase.toNumber();
        totalNetPnl += val;
        if (val > 0) winCount++;
        else if (val < 0) lossCount++;
      }
    }

    const dailySummaries = await this.prisma.dailySummary.findMany({
      where: {
        userId,
        date: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { date: 'asc' },
    });

    const daily = dailySummaries.map(d => ({
      date: d.date.toISOString(),
      netPnl: d.netPnl.toNumber(),
      tradesCount: d.tradesCount,
    }));

    return {
      totalNetPnl,
      tradeCount,
      winCount,
      lossCount,
      byPeriod: {
        daily,
        weekly: [],
        monthly: []
      }
    };
  }

  async getEquity(userId: string, from: Date, to: Date) {
    const profile = await this.prisma.profile.findUnique({ where: { id: userId } });
    const startingBalance = profile?.startingBalance?.toNumber() || 0;

    const result = await this.prisma.$queryRaw`
      WITH cumulative AS (
        SELECT 
          "date",
          SUM("netPnl") OVER (ORDER BY "date") as cumulative_pnl
        FROM "DailySummary"
        WHERE "userId" = ${userId} AND "date" <= ${to}
      )
      SELECT 
        "date",
        ${startingBalance} + cumulative_pnl as equity
      FROM cumulative
      WHERE "date" >= ${from}
      ORDER BY "date" ASC
    `;
    
    // We map the raw SQL output so that BigInt/Decimals are converted cleanly
    return (result as any[]).map(r => ({
      date: r.date.toISOString(),
      equity: Number(r.equity),
    }));
  }

  async getDrawdown(userId: string, from: Date, to: Date) {
    const profile = await this.prisma.profile.findUnique({ where: { id: userId } });
    const startingBalance = profile?.startingBalance?.toNumber() || 0;

    const result = await this.prisma.$queryRaw`
      WITH cumulative AS (
        SELECT 
          "date",
          ${startingBalance} + COALESCE(SUM("netPnl") OVER (ORDER BY "date"), 0) as equity
        FROM "DailySummary"
        WHERE "userId" = ${userId} AND "date" <= ${to}
      ),
      peaks AS (
        SELECT
          "date",
          equity,
          MAX(equity) OVER (ORDER BY "date") as peak_equity
        FROM cumulative
      )
      SELECT 
        "date",
        (peak_equity - equity) as drawdown
      FROM peaks
      WHERE "date" >= ${from}
      ORDER BY "date" ASC
    `;

    return (result as any[]).map(r => ({
      date: r.date.toISOString(),
      drawdown: Number(r.drawdown),
    }));
  }

  async getPerformanceMetrics(
    userId: string,
    from: Date,
    to: Date,
    includeOpen: boolean = false,
  ) {
    // Build the where clause — default: closed trades only
    const where: any = {
      userId,
      openedAt: { gte: from, lte: to },
    };

    if (!includeOpen) {
      where.closedAt = { not: null };
      where.netPnlBase = { not: null };
    }

    const trades = await this.prisma.trade.findMany({
      where,
      select: {
        netPnlBase: true,
        plannedRiskReward: true,
        closedAt: true,
      },
      orderBy: { closedAt: 'asc' },
    });

    // Edge case: zero trades in range
    if (trades.length === 0) {
      return {
        totalClosedTrades: 0,
        winRate: 0,
        profitFactor: null,
        expectancy: 0,
        avgWin: 0,
        avgLoss: 0,
        largestWin: 0,
        largestLoss: 0,
        avgPlannedRiskReward: null,
        tradesWithPlannedRR: 0,
        consecutiveWins: 0,
        consecutiveLosses: 0,
      };
    }

    let wins = 0;
    let losses = 0;
    let sumWins = 0;
    let sumLosses = 0;
    let largestWin = 0;
    let largestLoss = 0;

    // Planned R:R accumulators
    let sumPlannedRR = 0;
    let tradesWithPlannedRR = 0;

    // Streak tracking
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;

    for (const t of trades) {
      const pnl = t.netPnlBase ? t.netPnlBase.toNumber() : 0;

      if (pnl > 0) {
        wins++;
        sumWins += pnl;
        if (pnl > largestWin) largestWin = pnl;

        // Streak: extend win, reset loss
        currentWinStreak++;
        currentLossStreak = 0;
        if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
      } else if (pnl < 0) {
        losses++;
        sumLosses += pnl; // negative number
        if (pnl < largestLoss) largestLoss = pnl;

        // Streak: extend loss, reset win
        currentLossStreak++;
        currentWinStreak = 0;
        if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
      } else {
        // Breakeven trade (pnl === 0): resets both streaks
        currentWinStreak = 0;
        currentLossStreak = 0;
      }

      // Planned R:R — only count trades where it was actually set
      if (t.plannedRiskReward !== null && t.plannedRiskReward !== undefined) {
        const rr = t.plannedRiskReward.toNumber();
        sumPlannedRR += rr;
        tradesWithPlannedRR++;
      }
    }

    const totalClosedTrades = trades.length;
    const winRate = totalClosedTrades > 0 ? wins / totalClosedTrades : 0;
    const avgWin = wins > 0 ? sumWins / wins : 0;
    const avgLoss = losses > 0 ? Math.abs(sumLosses) / losses : 0;

    // Profit Factor: sum(wins) / abs(sum(losses))
    // If no losses, profit factor is Infinity conceptually — return null to let frontend decide display
    const profitFactor =
      sumLosses !== 0 ? sumWins / Math.abs(sumLosses) : (sumWins > 0 ? null : null);

    // Expectancy: (winRate * avgWin) - ((1 - winRate) * avgLoss)
    const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);

    // Avg Planned R:R — only over trades that have it
    const avgPlannedRiskReward =
      tradesWithPlannedRR > 0 ? sumPlannedRR / tradesWithPlannedRR : null;

    return {
      totalClosedTrades,
      winRate: Math.round(winRate * 10000) / 10000, // 4 decimal places (0.6667 = 66.67%)
      profitFactor: profitFactor !== null ? Math.round(profitFactor * 100) / 100 : null,
      expectancy: Math.round(expectancy * 100) / 100,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      largestWin: Math.round(largestWin * 100) / 100,
      largestLoss: Math.round(largestLoss * 100) / 100,
      avgPlannedRiskReward:
        avgPlannedRiskReward !== null
          ? Math.round(avgPlannedRiskReward * 100) / 100
          : null,
      tradesWithPlannedRR,
      consecutiveWins: maxWinStreak,
      consecutiveLosses: maxLossStreak,
    };
  }

  async getCalendar(userId: string, from: Date, to: Date) {
    const dailySummaries = await this.prisma.dailySummary.findMany({
      where: {
        userId,
        date: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { date: 'asc' },
    });

    return dailySummaries.map(d => ({
      date: d.date.toISOString().split('T')[0], // Extract just the YYYY-MM-DD
      netPnl: d.netPnl.toNumber(),
      tradesCount: d.tradesCount,
    }));
  }
}

