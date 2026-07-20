import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Dimension } from '../../shared/dto/dimension.schema';
import { toZonedTime } from 'date-fns-tz';

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
    } else if (['session', 'dayOfWeek', 'hour'].includes(dimension)) {
      return this.groupByTimeDimension(userId, dimension as 'session' | 'dayOfWeek' | 'hour', from, to, includeOpen);
    } else {
      throw new BadRequestException(`Unsupported dimension: ${dimension}`);
    }
  }

  private async groupByTimeDimension(userId: string, dimension: 'session' | 'dayOfWeek' | 'hour', from: Date, to: Date, includeOpen: boolean) {
    const profile = await this.prisma.profile.findUnique({ where: { id: userId } });
    const userTimezone = profile?.timezone || 'UTC';

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
      select: { openedAt: true, netPnlBase: true },
    });

    const groups: Record<string, { key: string, label: string, tradesCount: number, wins: number, netPnl: number }> = {};

    for (const t of trades) {
      const pnl = t.netPnlBase ? t.netPnlBase.toNumber() : 0;
      
      const keys: { key: string; label: string }[] = [];

      if (dimension === 'dayOfWeek') {
        const zoned = toZonedTime(t.openedAt, userTimezone);
        const day = zoned.getDay(); // 0 (Sun) to 6 (Sat)
        const labels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        keys.push({ key: day.toString(), label: labels[day] });
      } else if (dimension === 'hour') {
        const zoned = toZonedTime(t.openedAt, userTimezone);
        const hour = zoned.getHours(); // 0 to 23
        const label = `${hour.toString().padStart(2, '0')}:00`;
        keys.push({ key: hour.toString(), label });
      } else if (dimension === 'session') {
        // Sessions are absolute UTC: Asian 00:00-08:00, London 08:00-16:00, NY 13:00-21:00
        const utcHour = t.openedAt.getUTCHours();
        const utcFraction = utcHour + t.openedAt.getUTCMinutes() / 60;
        
        let assigned = false;
        
        // Asian (0 to 8)
        if (utcFraction >= 0 && utcFraction < 8) {
          keys.push({ key: 'asian', label: 'Asian Session' });
          assigned = true;
        }
        
        // London (8 to 16)
        if (utcFraction >= 8 && utcFraction < 16) {
          keys.push({ key: 'london', label: 'London Session' });
          assigned = true;
        }
        
        // NY (13 to 21)
        if (utcFraction >= 13 && utcFraction < 21) {
          keys.push({ key: 'new_york', label: 'New York Session' });
          assigned = true;
        }
        
        if (!assigned) {
          keys.push({ key: 'other', label: 'Other/Outside Core' });
        }
      }

      for (const { key, label } of keys) {
        if (!groups[key]) {
          groups[key] = { key, label, tradesCount: 0, wins: 0, netPnl: 0 };
        }
        groups[key].tradesCount++;
        groups[key].netPnl += pnl;
        if (pnl > 0) groups[key].wins++;
      }
    }

    return Object.values(groups).map(g => ({
      key: g.key,
      label: g.label,
      tradesCount: g.tradesCount,
      winRate: g.tradesCount > 0 ? Math.round((g.wins / g.tradesCount) * 10000) / 10000 : 0,
      netPnl: Math.round(g.netPnl * 100) / 100,
    })).sort((a, b) => {
      if (dimension === 'dayOfWeek' || dimension === 'hour') {
        return parseInt(a.key) - parseInt(b.key);
      }
      return b.netPnl - a.netPnl;
    });
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
