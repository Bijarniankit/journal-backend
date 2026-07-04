import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Request,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ImportsService } from './imports.service';
import {
  CreateMappingTemplateDto,
} from '../../shared/dto/import.schema';

// Multer augments Express.Multer only after an import — define locally to avoid the namespace gap
interface MulterFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('Imports')
@ApiBearerAuth('supabase-jwt')
@Controller()
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  // ─── Import Endpoints ──────────────────────────────────

  @Post('imports')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
      fileFilter: (_req, file, callback) => {
        const allowed = [
          'text/csv',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/octet-stream', // some browsers send this for .csv
        ];
        if (allowed.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException(
              `Unsupported file type: ${file.mimetype}. Use CSV or Excel files.`,
            ),
            false,
          );
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        columnMapping: { type: 'string', description: 'JSON column mapping' },
        mappingTemplateId: { type: 'string', description: 'Optional template ID' },
      },
      required: ['file', 'columnMapping'],
    },
  })
  async importFile(
    @Request() req: any,
    @UploadedFile() file: MulterFile,
    @Body() body: { columnMapping: string; mappingTemplateId?: string },
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Parse columnMapping from JSON string (sent as multipart form field)
    let columnMapping: Record<string, string>;
    try {
      columnMapping =
        typeof body.columnMapping === 'string'
          ? JSON.parse(body.columnMapping)
          : body.columnMapping;
    } catch {
      throw new BadRequestException(
        'Invalid columnMapping JSON. Send a JSON object mapping file columns to trade fields.',
      );
    }

    return this.importsService.processImport(
      req.user.id,
      file.buffer,
      file.originalname,
      columnMapping as any, // runtime-validated by mapRow; TS can't narrow JSON.parse return
      body.mappingTemplateId,
    );
  }

  @Get('imports')
  findAll(@Request() req: any) {
    return this.importsService.findAll(req.user.id);
  }

  @Get('imports/:id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.importsService.findOne(req.user.id, id);
  }

  // ─── Mapping Template Endpoints ────────────────────────

  @Post('mapping-templates')
  createTemplate(
    @Request() req: any,
    @Body() dto: CreateMappingTemplateDto,
  ) {
    return this.importsService.createTemplate(req.user.id, dto);
  }

  @Get('mapping-templates')
  findAllTemplates(@Request() req: any) {
    return this.importsService.findAllTemplates(req.user.id);
  }

  @Delete('mapping-templates/:id')
  deleteTemplate(@Request() req: any, @Param('id') id: string) {
    return this.importsService.deleteTemplate(req.user.id, id);
  }
}
