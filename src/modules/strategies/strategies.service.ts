import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStrategyDto, UpdateStrategyDto } from '../../shared/dto/strategy.schema';
import { Prisma } from '@prisma/client';

@Injectable()
export class StrategiesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateStrategyDto) {
    try {
      return await this.prisma.strategy.create({
        data: {
          userId,
          name: dto.name,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Strategy with name "${dto.name}" already exists.`);
      }
      throw error;
    }
  }

  async findAll(userId: string) {
    return this.prisma.strategy.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    const strategy = await this.prisma.strategy.findUnique({
      where: { id },
    });

    if (!strategy || strategy.userId !== userId) {
      throw new NotFoundException('Strategy not found');
    }

    return strategy;
  }

  async update(userId: string, id: string, dto: UpdateStrategyDto) {
    // Ensure it exists and belongs to user
    await this.findOne(userId, id);

    try {
      return await this.prisma.strategy.update({
        where: { id },
        data: {
          ...(dto.name && { name: dto.name }),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Strategy with name "${dto.name}" already exists.`);
      }
      throw error;
    }
  }

  async remove(userId: string, id: string) {
    // Ensure it exists and belongs to user
    await this.findOne(userId, id);

    return this.prisma.strategy.delete({
      where: { id },
    });
  }
}
