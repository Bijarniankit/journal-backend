import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
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
  @ApiOperation({
    summary: 'Request screenshot upload URL',
    description: 'Generates a temporary, pre-signed Supabase Storage URL. The frontend uses this URL to securely upload the actual image file directly to the storage bucket without routing heavy file traffic through the backend.',
  })
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
  @ApiOperation({
    summary: 'Confirm screenshot upload',
    description: 'After successfully uploading the file to the pre-signed URL, the frontend calls this endpoint to officially link the storage path to the Trade record in the database.',
  })
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
  @ApiOperation({
    summary: 'List trade screenshots',
    description: 'Retrieves all screenshots linked to a specific trade. Each screenshot record includes a newly generated, temporary signed URL so the frontend can securely display the image.',
  })
  findAll(@Request() req: any, @Param('tradeId') tradeId: string) {
    return this.screenshotsService.findAll(req.user.id, tradeId);
  }

  /**
   * DELETE /trades/:tradeId/screenshots/:screenshotId
   * Delete a screenshot from both storage and database.
   */
  @Delete(':screenshotId')
  @ApiOperation({
    summary: 'Delete a screenshot',
    description: 'Deletes a screenshot from both the Supabase Storage bucket and the database record.',
  })
  remove(
    @Request() req: any,
    @Param('tradeId') tradeId: string,
    @Param('screenshotId') screenshotId: string,
  ) {
    return this.screenshotsService.remove(req.user.id, tradeId, screenshotId);
  }
}
