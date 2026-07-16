import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const RangePresetSchema = z.enum([
  'today',
  'this_week',
  'this_month',
  'this_year',
  'past_1_year',
  'all_time',
]);

export type RangePreset = z.infer<typeof RangePresetSchema>;

export const RangeSchema = z.object({
  range: RangePresetSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).refine(data => {
  if (!data.range && (!data.from || !data.to)) {
    return false;
  }
  return true;
}, {
  message: "Either 'range' preset or both 'from' and 'to' must be provided",
}).refine(data => {
  if (data.from && data.to) {
    return new Date(data.from) <= new Date(data.to);
  }
  return true;
}, {
  message: "'from' date must be before or equal to 'to' date",
});

export class RangeQueryDto extends createZodDto(RangeSchema) {}
