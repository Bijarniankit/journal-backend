import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HeatmapType } from '../../shared/dto/heatmap.schema';
import { toZonedTime } from 'date-fns-tz';

@Injectable()
export class HeatmapService {
  constructor(private prisma: PrismaService) {}

  async getHeatmap(
    userId: string,
    type: HeatmapType,
    from: Date,
    to: Date,
    includeOpen: boolean = false,
  ) {
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
      select: {
        openedAt: true,
        netPnlBase: true,
        strategy: { select: { name: true } },
      },
    });

    let rows: string[] = [];
    let cols: string[] = [];
    
    if (type === 'day') {
      rows = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      cols = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
    } else if (type === 'session') {
      rows = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      cols = ['Asian', 'London', 'New York', 'Other'];
    } else if (type === 'strategy') {
      const strategies = new Set<string>();
      for (const t of trades) {
        strategies.add(t.strategy?.name || 'Unassigned');
      }
      rows = Array.from(strategies).sort();
      cols = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    }

    const cells: number[][] = Array.from({ length: rows.length }, () => Array(cols.length).fill(0));

    for (const t of trades) {
      const pnl = t.netPnlBase ? t.netPnlBase.toNumber() : 0;
      const zoned = toZonedTime(t.openedAt, userTimezone);
      const dayIndex = zoned.getDay();
      
      let rowIndex = -1;
      let colIndices: number[] = [];

      if (type === 'day') {
        rowIndex = dayIndex;
        colIndices = [zoned.getHours()];
      } else if (type === 'session') {
        rowIndex = dayIndex;
        const utcHour = t.openedAt.getUTCHours();
        const utcFraction = utcHour + t.openedAt.getUTCMinutes() / 60;
        
        let assigned = false;
        if (utcFraction >= 0 && utcFraction < 8) { colIndices.push(0); assigned = true; } // Asian
        if (utcFraction >= 8 && utcFraction < 16) { colIndices.push(1); assigned = true; } // London
        if (utcFraction >= 13 && utcFraction < 21) { colIndices.push(2); assigned = true; } // NY
        if (!assigned) colIndices.push(3); // Other
      } else if (type === 'strategy') {
        const stratName = t.strategy?.name || 'Unassigned';
        rowIndex = rows.indexOf(stratName);
        colIndices = [dayIndex];
      }

      if (rowIndex !== -1 && colIndices.length > 0) {
        for (const colIndex of colIndices) {
          cells[rowIndex][colIndex] += pnl;
        }
      }
    }

    for (let i = 0; i < rows.length; i++) {
      for (let j = 0; j < cols.length; j++) {
        cells[i][j] = Math.round(cells[i][j] * 100) / 100;
      }
    }

    return { rows, cols, cells };
  }
}
