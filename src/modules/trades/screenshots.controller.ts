import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ScreenshotsService } from './screenshots.service';
import {
  PresignRequestDto,
  ConfirmScreenshotDto,
} from '../../shared/dto/screenshot.schema';

@ApiTags('Screenshots')
@ApiBearerAuth('supabase-jwt')
@Controller('trades/:tradeId/screenshots')
export class ScreenshotsController {
  constructor(private readonly screenshotsService: ScreenshotsService) {}

  /**
   * POST /trades/:tradeId/screenshots/presign
   * Returns a signed upload URL. Client uploads directly to Supabase Storage.
   */
  @Post('presign')
  presign(
    @Request() req: any,
    @Param('tradeId') tradeId: string,
    @Body() dto: PresignRequestDto,
  ) {
    return this.screenshotsService.presignUpload(
      req.user.id,
      tradeId,
      dto.fileName,
    );
  }

  /**
   * POST /trades/:tradeId/screenshots/confirm
   * After the client uploads, record the attachment in our database.
   */
  @Post('confirm')
  confirm(
    @Request() req: any,
    @Param('tradeId') tradeId: string,
    @Body() dto: ConfirmScreenshotDto,
  ) {
    return this.screenshotsService.confirmUpload(
      req.user.id,
      tradeId,
      dto.storagePath,
      dto.label as any,
    );
  }

  /**
   * GET /trades/:tradeId/screenshots
   * List all screenshots for a trade with temporary signed URLs.
   */
  @Get()
  findAll(@Request() req: any, @Param('tradeId') tradeId: string) {
    return this.screenshotsService.findAll(req.user.id, tradeId);
  }

  /**
   * DELETE /trades/:tradeId/screenshots/:screenshotId
   * Delete a screenshot from both storage and database.
   */
  @Delete(':screenshotId')
  remove(
    @Request() req: any,
    @Param('tradeId') tradeId: string,
    @Param('screenshotId') screenshotId: string,
  ) {
    return this.screenshotsService.remove(req.user.id, tradeId, screenshotId);
  }
}
