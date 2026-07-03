import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTradeDto, UpdateTradeDto, TradeQueryDto } from '../../shared/dto/trade.schema';
import { Prisma } from '@prisma/client';

@Injectable()
export class TradesService {
  constructor(private prisma: PrismaService) {}

  computeMetrics(
    entryPrice: number,
    quantity: number,
    direction: 'LONG' | 'SHORT',
    fxToBase: number = 1,
    exitPrice?: number | null,
    stopLoss?: number | null,
    takeProfit?: number | null,
  ) {
    let netPnl = null;
    let netPnlBase = null;
    let plannedRiskReward = null;

    if (exitPrice !== undefined && exitPrice !== null) {
      const pnlMultiplier = direction === 'LONG' ? 1 : -1;
      netPnl = (exitPrice - entryPrice) * quantity * pnlMultiplier;
      netPnlBase = netPnl * fxToBase;
    }

    if (
      stopLoss !== undefined &&
      stopLoss !== null &&
      takeProfit !== undefined &&
      takeProfit !== null
    ) {
      const risk = Math.abs(entryPrice - stopLoss);
      const reward = Math.abs(takeProfit - entryPrice);
      if (risk > 0) {
        plannedRiskReward = reward / risk;
      }
    }

    return {
      netPnl,
      netPnlBase,
      plannedRiskReward,
    };
  }

  async create(userId: string, dto: CreateTradeDto) {
    const profile = await this.prisma.profile.findUnique({ where: { id: userId } });
    const currency = dto.currency || profile?.baseCurrency || 'USD';
    const fxToBase = 1; // Default to 1 in Phase 1

    const metrics = this.computeMetrics(
      dto.entryPrice,
      dto.quantity,
      dto.direction,
      fxToBase,
      dto.exitPrice,
      dto.stopLoss,
      dto.takeProfit,
    );

    const tagConnectOrCreate =
      dto.tagIds?.map((tagId) => ({
        tag: { connect: { id: tagId } },
      })) || [];

    return this.prisma.trade.create({
      data: {
        userId,
        symbol: dto.symbol,
        assetClass: dto.assetClass,
        entryPrice: dto.entryPrice,
        exitPrice: dto.exitPrice,
        quantity: dto.quantity,
        direction: dto.direction,
        stopLoss: dto.stopLoss,
        takeProfit: dto.takeProfit,
        currency,
        fxToBase,
        openedAt: new Date(dto.openedAt),
        closedAt: dto.closedAt ? new Date(dto.closedAt) : null,
        notes: dto.notes,
        strategyId: dto.strategyId,
        source: 'MANUAL',
        netPnl: metrics.netPnl,
        netPnlBase: metrics.netPnlBase,
        plannedRiskReward: metrics.plannedRiskReward,
        tags: {
          create: tagConnectOrCreate,
        },
      },
      include: { strategy: true, tags: { include: { tag: true } } },
    });
  }

  async findAll(userId: string, query: TradeQueryDto) {
    const { page, pageSize, symbol, strategyId, tagId, direction, assetClass } = query;

    const where: Prisma.TradeWhereInput = {
      userId,
      ...(symbol && { symbol: { contains: symbol, mode: 'insensitive' } }),
      ...(strategyId && { strategyId }),
      ...(direction && { direction }),
      ...(assetClass && { assetClass }),
      ...(tagId && { tags: { some: { tagId } } }),
    };

    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.trade.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { openedAt: 'desc' },
        include: { strategy: true, tags: { include: { tag: true } } },
      }),
      this.prisma.trade.count({ where }),
    ]);

    return { data, meta: { total, page, pageSize } };
  }

  async findOne(userId: string, id: string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id },
      include: { strategy: true, tags: { include: { tag: true } } },
    });

    if (!trade || trade.userId !== userId) {
      throw new NotFoundException('Trade not found');
    }

    return trade;
  }

  async update(userId: string, id: string, dto: UpdateTradeDto) {
    const existing = await this.findOne(userId, id);

    const entryPrice = dto.entryPrice ?? existing.entryPrice.toNumber();
    const quantity = dto.quantity ?? existing.quantity.toNumber();
    const direction = dto.direction ?? (existing.direction as 'LONG' | 'SHORT');
    const fxToBase = existing.fxToBase.toNumber();

    const exitPrice = dto.exitPrice !== undefined ? dto.exitPrice : existing.exitPrice?.toNumber();
    const stopLoss = dto.stopLoss !== undefined ? dto.stopLoss : existing.stopLoss?.toNumber();
    const takeProfit =
      dto.takeProfit !== undefined ? dto.takeProfit : existing.takeProfit?.toNumber();

    const metrics = this.computeMetrics(
      entryPrice,
      quantity,
      direction,
      fxToBase,
      exitPrice,
      stopLoss,
      takeProfit,
    );

    let tagsUpdate = undefined;
    if (dto.tagIds !== undefined) {
      tagsUpdate = {
        deleteMany: {},
        create: dto.tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })),
      };
    }

    return this.prisma.trade.update({
      where: { id },
      data: {
        ...(dto.symbol && { symbol: dto.symbol }),
        ...(dto.assetClass && { assetClass: dto.assetClass }),
        ...(dto.entryPrice !== undefined && { entryPrice: dto.entryPrice }),
        ...(dto.exitPrice !== undefined && { exitPrice: dto.exitPrice }),
        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
        ...(dto.direction && { direction: dto.direction }),
        ...(dto.stopLoss !== undefined && { stopLoss: dto.stopLoss }),
        ...(dto.takeProfit !== undefined && { takeProfit: dto.takeProfit }),
        ...(dto.currency && { currency: dto.currency }),
        ...(dto.openedAt && { openedAt: new Date(dto.openedAt) }),
        ...(dto.closedAt !== undefined && {
          closedAt: dto.closedAt ? new Date(dto.closedAt) : null,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.strategyId !== undefined && { strategyId: dto.strategyId }),
        netPnl: metrics.netPnl,
        netPnlBase: metrics.netPnlBase,
        plannedRiskReward: metrics.plannedRiskReward,
        ...(tagsUpdate && { tags: tagsUpdate }),
      },
      include: { strategy: true, tags: { include: { tag: true } } },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.trade.delete({
      where: { id },
    });
  }
}
