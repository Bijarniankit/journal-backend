import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { StrategiesModule } from '../src/modules/strategies/strategies.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';

@Injectable()
class MockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const userId = req.headers['x-mock-user-id'];
    if (!userId) return false;
    req.user = { id: userId };
    return true;
  }
}

describe('StrategiesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const user1 = { id: 'e2e-strat-user-1' };
  const user2 = { id: 'e2e-strat-user-2' };
  let stratId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }), PrismaModule, StrategiesModule],
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
    await prisma.strategy.deleteMany({ where: { userId: { in: [user1.id, user2.id] } } });
    await app.close();
  });

  it('POST /strategies - creates a strategy', async () => {
    const res = await request(app.getHttpServer())
      .post('/strategies')
      .set('x-mock-user-id', user1.id)
      .send({ name: 'Momentum E2E' })
      .expect(201);
    
    expect(res.body.name).toBe('Momentum E2E');
    stratId = res.body.id;
  });

  it('GET /strategies - lists strategies', async () => {
    const res = await request(app.getHttpServer())
      .get('/strategies')
      .set('x-mock-user-id', user1.id)
      .expect(200);
    
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(stratId);
  });

  it('GET /strategies/:id - tenant isolation', async () => {
    await request(app.getHttpServer())
      .get(`/strategies/${stratId}`)
      .set('x-mock-user-id', user2.id)
      .expect(404);
  });

  it('PATCH /strategies/:id - updates strategy', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/strategies/${stratId}`)
      .set('x-mock-user-id', user1.id)
      .send({ name: 'Momentum Updated' })
      .expect(200);
    
    expect(res.body.name).toBe('Momentum Updated');
  });

  it('DELETE /strategies/:id - deletes strategy', async () => {
    await request(app.getHttpServer())
      .delete(`/strategies/${stratId}`)
      .set('x-mock-user-id', user1.id)
      .expect(200);
  });
});
