import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProfilesService } from './profiles.service';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/decorators';

@ApiTags('Profile')
@ApiBearerAuth('supabase-jwt')
@Controller('me')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  /**
   * GET /me — returns the current user's profile, creating it on first call.
   */
  @Get()
  async getMe(@CurrentUser() user: AuthUser) {
    return this.profilesService.getOrCreateProfile(user);
  }

  /**
   * PATCH /me — update profile fields.
   */
  @Patch()
  async updateMe(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      displayName?: string;
      timezone?: string;
      baseCurrency?: string;
      startingBalance?: number;
    },
  ) {
    return this.profilesService.updateProfile(user.id, body);
  }
}
