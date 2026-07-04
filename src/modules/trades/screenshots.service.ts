import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// String literal type — mirrors the ScreenshotLabel enum in schema.prisma
// Will auto-resolve to Prisma's generated enum once `prisma generate` runs
type ScreenshotLabel = 'BEFORE' | 'AFTER';

const BUCKET_NAME = 'trade-screenshots';

@Injectable()
export class ScreenshotsService {
  private supabase: SupabaseClient;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.supabase = createClient(
      this.config.getOrThrow<string>('SUPABASE_URL'),
      this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  /**
   * Generate a presigned upload URL for the trade-screenshots bucket.
   * The client uploads directly to Supabase Storage — the file never
   * passes through NestJS.
   */
  async presignUpload(
    userId: string,
    tradeId: string,
    fileName: string,
  ): Promise<{ signedUrl: string; storagePath: string }> {
    // Verify trade exists and belongs to user
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
    });
    if (!trade || trade.userId !== userId) {
      throw new NotFoundException('Trade not found');
    }

    // Build storage path: userId/tradeId/timestamp-filename
    const timestamp = Date.now();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${userId}/${tradeId}/${timestamp}-${safeName}`;

    const { data, error } = await this.supabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      throw new InternalServerErrorException(
        `Failed to create signed upload URL: ${error?.message || 'Unknown error'}`,
      );
    }

    return {
      signedUrl: data.signedUrl,
      storagePath,
    };
  }

  /**
   * After the client uploads the file to Supabase Storage,
   * record the screenshot attachment in our database.
   */
  async confirmUpload(
    userId: string,
    tradeId: string,
    storagePath: string,
    label: ScreenshotLabel,
  ) {
    // Verify trade exists and belongs to user
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
    });
    if (!trade || trade.userId !== userId) {
      throw new NotFoundException('Trade not found');
    }

    return this.prisma.tradeScreenshot.create({
      data: {
        tradeId,
        storagePath,
        label,
      },
    });
  }

  /**
   * List all screenshots for a trade.
   */
  async findAll(userId: string, tradeId: string) {
    // Verify trade belongs to user
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
    });
    if (!trade || trade.userId !== userId) {
      throw new NotFoundException('Trade not found');
    }

    const screenshots = await this.prisma.tradeScreenshot.findMany({
      where: { tradeId },
      orderBy: { createdAt: 'asc' },
    });

    // Generate public URLs for each screenshot
    return Promise.all(
      screenshots.map(async (s: { storagePath: string; [key: string]: unknown }) => {
        const { data } = await this.supabase.storage
          .from(BUCKET_NAME)
          .createSignedUrl(s.storagePath, 3600); // 1 hour expiry

        return {
          ...s,
          url: data?.signedUrl || null,
        };
      }),
    );
  }

  /**
   * Delete a screenshot (both from database and storage).
   */
  async remove(userId: string, tradeId: string, screenshotId: string) {
    // Verify trade belongs to user
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
    });
    if (!trade || trade.userId !== userId) {
      throw new NotFoundException('Trade not found');
    }

    const screenshot = await this.prisma.tradeScreenshot.findUnique({
      where: { id: screenshotId },
    });
    if (!screenshot || screenshot.tradeId !== tradeId) {
      throw new NotFoundException('Screenshot not found');
    }

    // Delete from Supabase Storage
    await this.supabase.storage
      .from(BUCKET_NAME)
      .remove([screenshot.storagePath]);

    // Delete from database
    return this.prisma.tradeScreenshot.delete({
      where: { id: screenshotId },
    });
  }
}
