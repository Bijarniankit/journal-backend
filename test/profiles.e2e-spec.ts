import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ProfilesModule } from '../src/modules/profiles/profiles.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';

@Injectable()
class MockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const userId = req.headers['x-mock-user-id'];
    if (!userId) return false;
    req.user = { id: userId, email: `${userId}@example.com` };
    return true;
  }
}

describe('ProfilesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const user = { id: 'e2e-profile-user' };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }), PrismaModule, ProfilesModule],
      providers: [
        {
          provide: APP_GUARD,
          useClass: MockAuthGuard,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prisma.profile.deleteMany({ where: { id: user.id } });
    await app.close();
  });

  it('GET /me - creates and returns profile on first hit', async () => {
    const res = await request(app.getHttpServer())
      .get('/me')
      .set('x-mock-user-id', user.id)
      .expect(200);

    expect(res.body.id).toBe(user.id);
    expect(res.body.baseCurrency).toBe('INR'); // Default
    expect(res.body.timezone).toBe('UTC'); // Default
  });

  it('PATCH /me - updates profile', async () => {
    const res = await request(app.getHttpServer())
      .patch('/me')
      .set('x-mock-user-id', user.id)
      .send({ baseCurrency: 'USD', timezone: 'America/New_York' })
      .expect(200);

    expect(res.body.baseCurrency).toBe('USD');
    expect(res.body.timezone).toBe('America/New_York');
  });
});
