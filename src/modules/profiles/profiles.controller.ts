import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
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
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Retrieves the profile for the authenticated user. If a profile does not exist yet (first-time login), it is automatically created using the user details from the Supabase JWT.',
  })
  async getMe(@CurrentUser() user: AuthUser) {
    return this.profilesService.getOrCreateProfile(user);
  }

  /**
   * PATCH /me — update profile fields.
   */
  @Patch()
  @ApiOperation({
    summary: 'Update current user profile',
    description: 'Updates specific fields on the current user profile, such as displayName, timezone, baseCurrency, or startingBalance. Only provided fields will be modified.',
  })
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
