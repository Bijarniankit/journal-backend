import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the current user's profile, creating it on first call if absent.
   * Supabase Auth may have created the user before our first API hit.
   */
  async getOrCreateProfile(user: AuthUser) {
    const existing = await this.prisma.profile.findUnique({
      where: { id: user.id },
    });

    if (existing) {
      return existing;
    }

    // First API call — create the profile row
    return this.prisma.profile.create({
      data: {
        id: user.id,
        email: user.email,
      },
    });
  }

  /**
   * Update profile fields (timezone, baseCurrency, displayName, startingBalance).
   */
  async updateProfile(
    userId: string,
    data: {
      displayName?: string;
      timezone?: string;
      baseCurrency?: string;
      startingBalance?: number;
    },
  ) {
    return this.prisma.profile.update({
      where: { id: userId },
      data,
    });
  }
}
