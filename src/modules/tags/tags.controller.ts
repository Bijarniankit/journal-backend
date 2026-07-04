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
import { TagsService } from './tags.service';
import { CreateTagDto, UpdateTagDto } from '../../shared/dto/tag.schema';

@ApiTags('Tags')
@ApiBearerAuth('supabase-jwt')
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new tag',
    description: 'Creates a new tag for categorizing trades, belonging to the authenticated user.',
  })
  create(@Request() req: any, @Body() createTagDto: CreateTagDto) {
    return this.tagsService.create(req.user.id, createTagDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all tags',
    description: 'Retrieves all tags created by the authenticated user.',
  })
  findAll(@Request() req: any) {
    return this.tagsService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a specific tag',
    description: 'Retrieves a single tag by its ID, ensuring it belongs to the authenticated user.',
  })
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.tagsService.findOne(req.user.id, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a tag',
    description: 'Updates the name or details of an existing tag.',
  })
  update(@Request() req: any, @Param('id') id: string, @Body() updateTagDto: UpdateTagDto) {
    return this.tagsService.update(req.user.id, id, updateTagDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a tag',
    description: 'Deletes a tag by its ID. It must belong to the authenticated user.',
  })
  remove(@Request() req: any, @Param('id') id: string) {
    return this.tagsService.remove(req.user.id, id);
  }
}
