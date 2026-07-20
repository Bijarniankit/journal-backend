import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const HeatmapTypeEnum = z.enum([
  'day',
  'session',
  'strategy'
]);

export type HeatmapType = z.infer<typeof HeatmapTypeEnum>;

export const HeatmapQuerySchema = z.object({
  type: HeatmapTypeEnum,
});

export class HeatmapQueryDto extends createZodDto(HeatmapQuerySchema) {}
