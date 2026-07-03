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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TradesService } from './trades.service';
import { CreateTradeDto, UpdateTradeDto, TradeQueryDto } from '../../shared/dto/trade.schema';

@ApiTags('Trades')
@ApiBearerAuth('supabase-jwt')
@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Post()
  create(@Request() req: any, @Body() createTradeDto: CreateTradeDto) {
    return this.tradesService.create(req.user.id, createTradeDto);
  }

  @Get()
  findAll(@Request() req: any, @Query() query: TradeQueryDto) {
    return this.tradesService.findAll(req.user.id, query);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.tradesService.findOne(req.user.id, id);
  }

  @Patch(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() updateTradeDto: UpdateTradeDto) {
    return this.tradesService.update(req.user.id, id, updateTradeDto);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.tradesService.remove(req.user.id, id);
  }
}
