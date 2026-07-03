import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TradesModule } from '../src/modules/trades/trades.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * A simple mock guard that reads 'x-mock-user-id' from request headers
 * and injects it as req.user.id, simulating authenticated Supabase users.
 */
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

describe('TradesController (e2e) & Tenant Isolation', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const user1 = { id: 'e2e-user-1' };
  const user2 = { id: 'e2e-user-2' };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }), TradesModule],
      providers: [
        // Register our mock guard as the sole global guard
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
    // Clean up any test trades created during this run
    await prisma.trade.deleteMany({
      where: { userId: { in: [user1.id, user2.id] } },
    });
    await app.close();
  });

  describe('CRUD & Tenant Isolation', () => {
    let user1TradeId: string;

    it('POST /trades (user 1) - creates a trade', async () => {
      const dto = {
        symbol: 'AAPL',
        assetClass: 'EQUITY',
        direction: 'LONG',
        entryPrice: 150,
        quantity: 10,
        openedAt: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/trades')
        .set('x-mock-user-id', user1.id)
        .send(dto)
        .expect(201);

      expect(res.body.userId).toBe(user1.id);
      expect(res.body.symbol).toBe('AAPL');
      user1TradeId = res.body.id;
    });

    it('GET /trades/:id (user 1) - retrieves the trade', async () => {
      const res = await request(app.getHttpServer())
        .get(`/trades/${user1TradeId}`)
        .set('x-mock-user-id', user1.id)
        .expect(200);

      expect(res.body.id).toBe(user1TradeId);
    });

    it('GET /trades/:id (user 2) - FAILS to retrieve user 1 trade (tenant isolation)', async () => {
      await request(app.getHttpServer())
        .get(`/trades/${user1TradeId}`)
        .set('x-mock-user-id', user2.id)
        .expect(404);
    });

    it('PATCH /trades/:id (user 2) - FAILS to update user 1 trade', async () => {
      await request(app.getHttpServer())
        .patch(`/trades/${user1TradeId}`)
        .set('x-mock-user-id', user2.id)
        .send({ symbol: 'TSLA' })
        .expect(404);
    });

    it('PATCH /trades/:id (user 1) - successfully updates trade', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/trades/${user1TradeId}`)
        .set('x-mock-user-id', user1.id)
        .send({ exitPrice: 160 })
        .expect(200);

      // Verify computed metrics ran: (160 - 150) * 10 * 1 = 100
      expect(res.body.exitPrice).toBe('160');
      expect(res.body.netPnl).toBe('100');
    });

    it('DELETE /trades/:id (user 2) - FAILS to delete user 1 trade', async () => {
      await request(app.getHttpServer())
        .delete(`/trades/${user1TradeId}`)
        .set('x-mock-user-id', user2.id)
        .expect(404);
    });

    it('DELETE /trades/:id (user 1) - successfully deletes trade', async () => {
      await request(app.getHttpServer())
        .delete(`/trades/${user1TradeId}`)
        .set('x-mock-user-id', user1.id)
        .expect(200);
    });
  });
});
