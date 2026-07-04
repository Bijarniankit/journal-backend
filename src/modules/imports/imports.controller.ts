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
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody, ApiOperation } from '@nestjs/swagger';
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
  @ApiOperation({
    summary: 'Upload and process a trade file (CSV/Excel)',
    description: 'Uploads a CSV or Excel file containing trade data. The file is parsed and each row is mapped to trade properties using either a provided JSON `columnMapping` or a saved `mappingTemplateId`. Duplicate trades are silently skipped based on a hash of symbol, date, quantity, and price.',
  })
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
  @ApiOperation({
    summary: 'List import history',
    description: 'Retrieves a list of all file imports performed by the user, including their success/failure counts and any row-level errors.',
  })
  findAll(@Request() req: any) {
    return this.importsService.findAll(req.user.id);
  }

  @Get('imports/:id')
  @ApiOperation({
    summary: 'Get import details',
    description: 'Retrieves detailed information about a specific file import session by its ID.',
  })
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.importsService.findOne(req.user.id, id);
  }

  // ─── Mapping Template Endpoints ────────────────────────

  @Post('mapping-templates')
  @ApiOperation({
    summary: 'Create a mapping template',
    description: 'Saves a column mapping configuration so it can be reused for future CSV/Excel imports from the same broker.',
  })
  createTemplate(
    @Request() req: any,
    @Body() dto: CreateMappingTemplateDto,
  ) {
    return this.importsService.createTemplate(req.user.id, dto);
  }

  @Get('mapping-templates')
  @ApiOperation({
    summary: 'List mapping templates',
    description: 'Retrieves all saved broker column mapping templates for the user.',
  })
  findAllTemplates(@Request() req: any) {
    return this.importsService.findAllTemplates(req.user.id);
  }

  @Delete('mapping-templates/:id')
  @ApiOperation({
    summary: 'Delete a mapping template',
    description: 'Deletes a saved mapping template by its ID.',
  })
  deleteTemplate(@Request() req: any, @Param('id') id: string) {
    return this.importsService.deleteTemplate(req.user.id, id);
  }
}
