import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { CurrentUser, AuthUser } from '../../common/decorators';

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
