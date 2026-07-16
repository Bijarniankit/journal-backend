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
}

