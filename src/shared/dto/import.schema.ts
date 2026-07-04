import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// ─── Column Mapping ──────────────────────────────────────

/**
 * Valid trade fields that a CSV/Excel column can map to.
 */
export const MAPPABLE_TRADE_FIELDS = [
  'symbol',
  'assetClass',
  'entryPrice',
  'exitPrice',
  'quantity',
  'direction',
  'stopLoss',
  'takeProfit',
  'currency',
  'openedAt',
  'closedAt',
  'notes',
] as const;

export const ColumnMappingSchema = z.record(
  z.string(),                                        // file column header
  z.enum(MAPPABLE_TRADE_FIELDS),                     // our trade field
);

export const CreateMappingTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  columnMap: ColumnMappingSchema,
});

export const UpdateMappingTemplateSchema = CreateMappingTemplateSchema.partial();

// ─── Import Request ──────────────────────────────────────

export const ImportRequestSchema = z.object({
  columnMapping: ColumnMappingSchema,
  mappingTemplateId: z.string().uuid().optional(),
});

// ─── DTOs ────────────────────────────────────────────────

export class CreateMappingTemplateDto extends createZodDto(CreateMappingTemplateSchema) {}
export class UpdateMappingTemplateDto extends createZodDto(UpdateMappingTemplateSchema) {}
export class ImportRequestDto extends createZodDto(ImportRequestSchema) {}

export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;
