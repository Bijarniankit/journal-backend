import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StrategiesService } from './strategies.service';
import { CreateStrategyDto, UpdateStrategyDto } from '../../shared/dto/strategy.schema';

@ApiTags('Strategies')
@ApiBearerAuth('supabase-jwt')
@Controller('strategies')
export class StrategiesController {
  constructor(private readonly strategiesService: StrategiesService) {}

  @Post()
  create(@Request() req: any, @Body() createStrategyDto: CreateStrategyDto) {
    return this.strategiesService.create(req.user.id, createStrategyDto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.strategiesService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.strategiesService.findOne(req.user.id, id);
  }

  @Patch(':id')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updateStrategyDto: UpdateStrategyDto,
  ) {
    return this.strategiesService.update(req.user.id, id, updateStrategyDto);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.strategiesService.remove(req.user.id, id);
  }
}
