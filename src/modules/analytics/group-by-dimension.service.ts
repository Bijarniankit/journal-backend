import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Dimension } from '../../shared/dto/dimension.schema';

@Injectable()
export class GroupByDimensionService {
  constructor(private prisma: PrismaService) {}

  async group(
    userId: string,
    dimension: Dimension,
    from: Date,
    to: Date,
    includeOpen: boolean = false,
  ) {
    if (dimension === 'strategy') {
      return this.groupByStrategy(userId, from, to, includeOpen);
    } else if (dimension === 'tag') {
      return this.groupByTag(userId, from, to, includeOpen);
    } else {
      throw new BadRequestException(`Unsupported dimension: ${dimension}`);
    }
  }

  private async groupByStrategy(userId: string, from: Date, to: Date, includeOpen: boolean) {
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
        strategyId: true,
        netPnlBase: true,
        strategy: { select: { name: true } },
      },
    });

    const groups: Record<string, { key: string, label: string, tradesCount: number, wins: number, netPnl: number }> = {};
    const unassignedKey = 'unassigned';

    for (const t of trades) {
      const key = t.strategyId || unassignedKey;
      const label = t.strategy?.name || 'Unassigned';
      const pnl = t.netPnlBase ? t.netPnlBase.toNumber() : 0;

      if (!groups[key]) {
        groups[key] = { key, label, tradesCount: 0, wins: 0, netPnl: 0 };
      }

      groups[key].tradesCount++;
      groups[key].netPnl += pnl;
      if (pnl > 0) {
        groups[key].wins++;
      }
    }

    return Object.values(groups).map(g => ({
      key: g.key,
      label: g.label,
      tradesCount: g.tradesCount,
      winRate: g.tradesCount > 0 ? Math.round((g.wins / g.tradesCount) * 10000) / 10000 : 0,
      netPnl: Math.round(g.netPnl * 100) / 100,
    })).sort((a, b) => b.netPnl - a.netPnl);
  }

  private async groupByTag(userId: string, from: Date, to: Date, includeOpen: boolean) {
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
        tags: { select: { tag: { select: { id: true, name: true } } } },
      },
    });

    const groups: Record<string, { key: string, label: string, tradesCount: number, wins: number, netPnl: number }> = {};

    for (const t of trades) {
      const pnl = t.netPnlBase ? t.netPnlBase.toNumber() : 0;
      
      // If a trade has multiple tags, it contributes its PnL and outcome to all of those tags
      if (t.tags.length === 0) {
        const key = 'unassigned';
        if (!groups[key]) {
          groups[key] = { key, label: 'Unassigned', tradesCount: 0, wins: 0, netPnl: 0 };
        }
        groups[key].tradesCount++;
        groups[key].netPnl += pnl;
        if (pnl > 0) groups[key].wins++;
      } else {
        for (const tradeTag of t.tags) {
          const key = tradeTag.tag.id;
          const label = tradeTag.tag.name;
          if (!groups[key]) {
            groups[key] = { key, label, tradesCount: 0, wins: 0, netPnl: 0 };
          }
          groups[key].tradesCount++;
          groups[key].netPnl += pnl;
          if (pnl > 0) groups[key].wins++;
        }
      }
    }

    return Object.values(groups).map(g => ({
      key: g.key,
      label: g.label,
      tradesCount: g.tradesCount,
      winRate: g.tradesCount > 0 ? Math.round((g.wins / g.tradesCount) * 10000) / 10000 : 0,
      netPnl: Math.round(g.netPnl * 100) / 100,
    })).sort((a, b) => b.netPnl - a.netPnl);
  }
}
