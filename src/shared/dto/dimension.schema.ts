import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const DimensionEnum = z.enum([
  'strategy',
  'tag',
  'session',
  'dayOfWeek',
  'hour'
]);

export type Dimension = z.infer<typeof DimensionEnum>;

export const DimensionQuerySchema = z.object({
  dimension: DimensionEnum,
});

export class DimensionQueryDto extends createZodDto(DimensionQuerySchema) {}
