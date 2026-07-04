import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { TradesModule } from './modules/trades/trades.module';
import { StrategiesModule } from './modules/strategies/strategies.module';
import { TagsModule } from './modules/tags/tags.module';
import { ImportsModule } from './modules/imports/imports.module';

@Module({
  imports: [
    // ─── Config ────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ─── Rate Limiting ─────────────────────────────────────
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL', 60000),
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
    }),

    // ─── BullMQ (registered, no processors yet) ───────────
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL'),
        },
      }),
    }),

    // ─── Database ──────────────────────────────────────────
    PrismaModule,

    // ─── Feature Modules ───────────────────────────────────
    AuthModule,
    ProfilesModule,
    TradesModule,
    StrategiesModule,
    TagsModule,
    ImportsModule,
  ],
  providers: [
    // Global rate-limit guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
