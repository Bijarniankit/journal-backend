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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StrategiesService } from './strategies.service';
import { CreateStrategyDto, UpdateStrategyDto } from '../../shared/dto/strategy.schema';

@ApiTags('Strategies')
@ApiBearerAuth('supabase-jwt')
@Controller('strategies')
export class StrategiesController {
  constructor(private readonly strategiesService: StrategiesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new strategy',
    description: 'Creates a new trading strategy for the authenticated user.',
  })
  create(@Request() req: any, @Body() createStrategyDto: CreateStrategyDto) {
    return this.strategiesService.create(req.user.id, createStrategyDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all strategies',
    description: 'Retrieves all trading strategies belonging to the authenticated user.',
  })
  findAll(@Request() req: any) {
    return this.strategiesService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a specific strategy',
    description: 'Retrieves a single trading strategy by its ID, ensuring it belongs to the authenticated user.',
  })
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.strategiesService.findOne(req.user.id, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a strategy',
    description: 'Updates an existing trading strategy. Only the provided fields will be modified.',
  })
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updateStrategyDto: UpdateStrategyDto,
  ) {
    return this.strategiesService.update(req.user.id, id, updateStrategyDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a strategy',
    description: 'Deletes a trading strategy by its ID. It must belong to the authenticated user.',
  })
  remove(@Request() req: any, @Param('id') id: string) {
    return this.strategiesService.remove(req.user.id, id);
  }
}
