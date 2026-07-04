import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TradesService } from './trades.service';
import { CreateTradeDto, UpdateTradeDto, TradeQueryDto } from '../../shared/dto/trade.schema';

@ApiTags('Trades')
@ApiBearerAuth('supabase-jwt')
@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new trade',
    description: 'Creates a manual trade for the user. Net PnL and risk metrics are automatically calculated based on the provided prices and quantities. Can be linked to an existing strategy and multiple tags.',
  })
  create(@Request() req: any, @Body() createTradeDto: CreateTradeDto) {
    return this.tradesService.create(req.user.id, createTradeDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List trades',
    description: 'Retrieves a paginated list of trades for the user. Supports optional filtering by dates, symbols, asset class, status (open/closed), strategy, and tags.',
  })
  findAll(@Request() req: any, @Query() query: TradeQueryDto) {
    return this.tradesService.findAll(req.user.id, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a specific trade',
    description: 'Retrieves complete details of a single trade by its ID, including associated tags, screenshots, and strategy.',
  })
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.tradesService.findOne(req.user.id, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a trade',
    description: 'Updates specific fields on an existing trade. If prices or quantities are updated, metrics (like Net PnL) will be automatically re-calculated.',
  })
  update(@Request() req: any, @Param('id') id: string, @Body() updateTradeDto: UpdateTradeDto) {
    return this.tradesService.update(req.user.id, id, updateTradeDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a trade',
    description: 'Permanently deletes a trade and its associated cascading records (like tags and screenshots mappings).',
  })
  remove(@Request() req: any, @Param('id') id: string) {
    return this.tradesService.remove(req.user.id, id);
  }
}
