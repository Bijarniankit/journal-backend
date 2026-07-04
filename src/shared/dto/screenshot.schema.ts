import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const ScreenshotLabelEnum = z.enum(['BEFORE', 'AFTER']);

export const PresignRequestSchema = z.object({
  label: ScreenshotLabelEnum,
  fileName: z.string().min(1).max(255),
  contentType: z.string().regex(/^image\//, 'Only image files are allowed'),
});

export const ConfirmScreenshotSchema = z.object({
  storagePath: z.string().min(1),
  label: ScreenshotLabelEnum,
});

export class PresignRequestDto extends createZodDto(PresignRequestSchema) {}
export class ConfirmScreenshotDto extends createZodDto(ConfirmScreenshotSchema) {}
