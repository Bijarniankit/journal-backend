import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTagDto, UpdateTagDto } from '../../shared/dto/tag.schema';
import { Prisma } from '@prisma/client';

@Injectable()
export class TagsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateTagDto) {
    try {
      return await this.prisma.tag.create({
        data: {
          userId,
          name: dto.name,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Tag with name "${dto.name}" already exists.`);
      }
      throw error;
    }
  }

  async findAll(userId: string) {
    return this.prisma.tag.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
    });

    if (!tag || tag.userId !== userId) {
      throw new NotFoundException('Tag not found');
    }

    return tag;
  }

  async update(userId: string, id: string, dto: UpdateTagDto) {
    await this.findOne(userId, id);

    try {
      return await this.prisma.tag.update({
        where: { id },
        data: {
          ...(dto.name && { name: dto.name }),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Tag with name "${dto.name}" already exists.`);
      }
      throw error;
    }
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);

    return this.prisma.tag.delete({
      where: { id },
    });
  }
}
