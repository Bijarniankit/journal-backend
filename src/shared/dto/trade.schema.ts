import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const TradeAssetClass = z.enum(['EQUITY', 'OPTION', 'FUTURE', 'FOREX', 'CRYPTO']);
export const TradeDirection = z.enum(['LONG', 'SHORT']);

export const CreateTradeSchema = z.object({
  symbol: z.string().min(1).max(20),
  assetClass: TradeAssetClass,
  entryPrice: z.number().positive(),
  exitPrice: z.number().positive().nullable().optional(),
  quantity: z.number().positive(),
  direction: TradeDirection,
  stopLoss: z.number().positive().nullable().optional(),
  takeProfit: z.number().positive().nullable().optional(),
  currency: z.string().length(3).optional(),
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  strategyId: z.string().uuid().nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

export const UpdateTradeSchema = CreateTradeSchema.partial();

export const TradeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  symbol: z.string().optional(),
  strategyId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  direction: TradeDirection.optional(),
  assetClass: TradeAssetClass.optional(),
});

export class CreateTradeDto extends createZodDto(CreateTradeSchema) {}
export class UpdateTradeDto extends createZodDto(UpdateTradeSchema) {}
export class TradeQueryDto extends createZodDto(TradeQuerySchema) {}
