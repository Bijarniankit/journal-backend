import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const CreateStrategySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

export const UpdateStrategySchema = CreateStrategySchema.partial();

export class CreateStrategyDto extends createZodDto(CreateStrategySchema) {}
export class UpdateStrategyDto extends createZodDto(UpdateStrategySchema) {}
