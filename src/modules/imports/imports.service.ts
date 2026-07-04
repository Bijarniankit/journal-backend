import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TradesService } from '../trades/trades.service';
import { CreateTradeSchema } from '../../shared/dto/trade.schema';
import { ColumnMapping } from '../../shared/dto/import.schema';
import { createHash } from 'crypto';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';

export interface RowError {
  row: number;
  field?: string;
  message: string;
}

@Injectable()
export class ImportsService {
  constructor(
    private prisma: PrismaService,
    private tradesService: TradesService,
  ) {}

  // ─── Dedup Hash ──────────────────────────────────────────

  /**
   * Derive a deterministic externalId from trade fields so re-importing
   * the same file (or the same trade arriving via SnapTrade) collides
   * on @@unique([userId, source, externalId]).
   */
  generateDedupHash(
    symbol: string,
    openedAt: string,
    quantity: number | string,
    entryPrice: number | string,
  ): string {
    const raw = `${symbol}|${openedAt}|${quantity}|${entryPrice}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  // ─── File Parsing ────────────────────────────────────────

  parseFile(buffer: Buffer, fileName: string): Record<string, string>[] {
    const ext = fileName.toLowerCase().split('.').pop();

    if (ext === 'csv') {
      const text = buffer.toString('utf-8');
      const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
      });

      if (result.errors.length > 0) {
        const errMsg = result.errors
          .slice(0, 5)
          .map((e) => `Row ${e.row}: ${e.message}`)
          .join('; ');
        throw new BadRequestException(`CSV parse errors: ${errMsg}`);
      }

      return result.data;
    }

    if (ext === 'xlsx' || ext === 'xls') {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) {
        throw new BadRequestException('Excel file has no sheets');
      }
      return XLSX.utils.sheet_to_json<Record<string, string>>(firstSheet, {
        defval: '',
      });
    }

    throw new BadRequestException(
      `Unsupported file format: .${ext}. Use .csv, .xlsx, or .xls`,
    );
  }

  // ─── Row Mapping ─────────────────────────────────────────

  mapRow(
    rawRow: Record<string, string>,
    mapping: ColumnMapping,
    baseCurrency: string,
  ): { mapped: Record<string, unknown>; notices: string[] } {
    const mapped: Record<string, unknown> = {};
    const notices: string[] = [];

    // Apply column mapping
    for (const [fileCol, tradeField] of Object.entries(mapping)) {
      const value = rawRow[fileCol];
      if (value !== undefined && value !== '') {
        mapped[tradeField] = value;
      }
    }

    // Coerce numeric fields
    const numericFields = [
      'entryPrice',
      'exitPrice',
      'quantity',
      'stopLoss',
      'takeProfit',
    ];
    for (const field of numericFields) {
      if (mapped[field] !== undefined) {
        const num = Number(mapped[field]);
        mapped[field] = isNaN(num) ? mapped[field] : num;
      }
    }

    // Default currency if absent
    if (!mapped['currency']) {
      mapped['currency'] = baseCurrency;
      notices.push(`Defaulted currency to ${baseCurrency}`);
    }

    // Default assetClass if absent
    if (!mapped['assetClass']) {
      mapped['assetClass'] = 'EQUITY';
      notices.push('Defaulted assetClass to EQUITY');
    }

    // Normalize direction to uppercase
    if (mapped['direction'] && typeof mapped['direction'] === 'string') {
      mapped['direction'] = mapped['direction'].toUpperCase();
    }

    // Handle nullable fields — set to null if empty
    if (mapped['exitPrice'] === '' || mapped['exitPrice'] === undefined) {
      mapped['exitPrice'] = null;
    }
    if (mapped['stopLoss'] === '' || mapped['stopLoss'] === undefined) {
      mapped['stopLoss'] = null;
    }
    if (mapped['takeProfit'] === '' || mapped['takeProfit'] === undefined) {
      mapped['takeProfit'] = null;
    }
    if (mapped['closedAt'] === '' || mapped['closedAt'] === undefined) {
      mapped['closedAt'] = null;
    }
    if (mapped['notes'] === '' || mapped['notes'] === undefined) {
      mapped['notes'] = null;
    }

    return { mapped, notices };
  }

  // ─── Import Execution ───────────────────────────────────

  async processImport(
    userId: string,
    fileBuffer: Buffer,
    fileName: string,
    columnMapping: ColumnMapping,
    mappingTemplateId?: string,
  ) {
    // Create the Import record
    const importRecord = await this.prisma.import.create({
      data: {
        userId,
        status: 'PROCESSING',
        fileName,
        mappingTemplateId: mappingTemplateId || null,
      },
    });

    try {
      // Fetch user profile for baseCurrency default
      const profile = await this.prisma.profile.findUnique({
        where: { id: userId },
      });
      const baseCurrency = profile?.baseCurrency || 'INR';

      // Resolve column mapping from template if not provided directly
      let activeMapping = columnMapping;
      if (!activeMapping && mappingTemplateId) {
        const template = await this.prisma.mappingTemplate.findUnique({
          where: { id: mappingTemplateId },
        });
        if (!template || template.userId !== userId) {
          throw new BadRequestException('Invalid mappingTemplateId');
        }
        activeMapping = template.columnMap as unknown as ColumnMapping;
      }

      if (!activeMapping) {
        throw new BadRequestException('Either columnMapping or mappingTemplateId must be provided');
      }

      // Parse
      const rawRows = this.parseFile(fileBuffer, fileName);
      const totalRows = rawRows.length;

      const rowErrors: RowError[] = [];
      const allNotices: string[] = [];
      let successCount = 0;
      let skippedCount = 0;

      // Process each row
      for (let i = 0; i < rawRows.length; i++) {
        const rowNum = i + 2; // +2 because row 1 is header, data starts at 2
        try {
          const { mapped, notices } = this.mapRow(
            rawRows[i],
            activeMapping,
            baseCurrency,
          );

          // Collect notices (only from first row to avoid flooding)
          if (i === 0 && notices.length > 0) {
            allNotices.push(...notices);
          }

          // Validate against CreateTradeSchema
          const validation = CreateTradeSchema.safeParse(mapped);
          if (!validation.success) {
            const issues = validation.error.issues.map(
              (issue) => `${issue.path.join('.')}: ${issue.message}`,
            );
            rowErrors.push({
              row: rowNum,
              message: issues.join('; '),
            });
            continue;
          }

          const validData = validation.data;

          // Generate dedup hash
          const externalId = this.generateDedupHash(
            validData.symbol,
            validData.openedAt,
            validData.quantity,
            validData.entryPrice,
          );

          // Compute metrics
          const metrics = this.tradesService.computeMetrics(
            validData.entryPrice,
            validData.quantity,
            validData.direction,
            1, // fxToBase default
            validData.exitPrice,
            validData.stopLoss,
            validData.takeProfit,
          );

          // Try to create — if dedup collision, skip
          try {
            await this.prisma.trade.create({
              data: {
                userId,
                symbol: validData.symbol,
                assetClass: validData.assetClass,
                entryPrice: validData.entryPrice,
                exitPrice: validData.exitPrice ?? null,
                quantity: validData.quantity,
                direction: validData.direction,
                stopLoss: validData.stopLoss ?? null,
                takeProfit: validData.takeProfit ?? null,
                currency: validData.currency || baseCurrency,
                fxToBase: 1,
                openedAt: new Date(validData.openedAt),
                closedAt: validData.closedAt
                  ? new Date(validData.closedAt)
                  : null,
                notes: validData.notes ?? null,
                strategyId: validData.strategyId ?? null,
                source: 'IMPORT',
                externalId,
                netPnl: metrics.netPnl,
                netPnlBase: metrics.netPnlBase,
                plannedRiskReward: metrics.plannedRiskReward,
              },
            });
            successCount++;
          } catch (error) {
            // Unique constraint violation = duplicate, skip silently
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002'
            ) {
              skippedCount++;
            } else {
              throw error;
            }
          }
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            skippedCount++;
          } else {
            rowErrors.push({
              row: rowNum,
              message:
                error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }

      // Update import record with results
      return this.prisma.import.update({
        where: { id: importRecord.id },
        data: {
          status: 'DONE',
          totalRows,
          successCount,
          errorCount: rowErrors.length,
          skippedCount,
          rowErrors: rowErrors as unknown as Prisma.JsonArray,
          notices: allNotices as unknown as Prisma.JsonArray,
        },
      });
    } catch (error) {
      // Mark import as failed on catastrophic errors
      await this.prisma.import.update({
        where: { id: importRecord.id },
        data: {
          status: 'FAILED',
          rowErrors: [
            {
              row: 0,
              message:
                error instanceof Error
                  ? error.message
                  : 'Import failed unexpectedly',
            },
          ] as unknown as Prisma.JsonArray,
        },
      });
      throw error;
    }
  }

  // ─── Import Queries ─────────────────────────────────────

  async findAll(userId: string) {
    return this.prisma.import.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { mappingTemplate: true },
    });
  }

  async findOne(userId: string, id: string) {
    const record = await this.prisma.import.findUnique({
      where: { id },
      include: { mappingTemplate: true },
    });

    if (!record || record.userId !== userId) {
      throw new NotFoundException('Import not found');
    }

    return record;
  }

  // ─── Mapping Templates ─────────────────────────────────

  async createTemplate(
    userId: string,
    data: { name: string; columnMap: Record<string, string> },
  ) {
    try {
      return await this.prisma.mappingTemplate.create({
        data: {
          userId,
          name: data.name,
          columnMap: data.columnMap as unknown as Prisma.JsonObject,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Mapping template with name "${data.name}" already exists.`,
        );
      }
      throw error;
    }
  }

  async findAllTemplates(userId: string) {
    return this.prisma.mappingTemplate.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteTemplate(userId: string, id: string) {
    const template = await this.prisma.mappingTemplate.findUnique({
      where: { id },
    });

    if (!template || template.userId !== userId) {
      throw new NotFoundException('Mapping template not found');
    }

    return this.prisma.mappingTemplate.delete({ where: { id } });
  }
}
