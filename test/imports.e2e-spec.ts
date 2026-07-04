import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ImportsModule } from '../src/modules/imports/imports.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import * as path from 'path';
import * as fs from 'fs';

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

describe('ImportsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const user = { id: 'e2e-import-user' };
  let templateId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }), PrismaModule, ImportsModule],
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

    // Create a dummy profile so the default currency works
    await prisma.profile.create({
      data: {
        id: user.id,
        email: 'e2e-import@example.com',
        baseCurrency: 'USD',
        timezone: 'UTC',
      },
    });
  });

  afterAll(async () => {
    await prisma.trade.deleteMany({ where: { userId: user.id } });
    await prisma.import.deleteMany({ where: { userId: user.id } });
    await prisma.mappingTemplate.deleteMany({ where: { userId: user.id } });
    await prisma.profile.deleteMany({ where: { id: user.id } });
    await app.close();
  });

  it('POST /mapping-templates - creates a mapping template', async () => {
    const res = await request(app.getHttpServer())
      .post('/mapping-templates')
      .set('x-mock-user-id', user.id)
      .send({
        name: 'My Broker CSV',
        columnMap: {
          'Symbol': 'symbol',
          'Direction': 'direction',
          'Asset Class': 'assetClass',
          'Qty': 'quantity',
          'Entry Price': 'entryPrice',
          'Opened At': 'openedAt'
        }
      })
      .expect(201);
    
    expect(res.body.name).toBe('My Broker CSV');
    templateId = res.body.id;
  });

  it('GET /mapping-templates - lists templates', async () => {
    const res = await request(app.getHttpServer())
      .get('/mapping-templates')
      .set('x-mock-user-id', user.id)
      .expect(200);
    
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(templateId);
  });

  it('POST /imports - uploads and processes a CSV file', async () => {
    // Create a dummy CSV in memory
    const csvContent = "Symbol,Direction,Asset Class,Qty,Entry Price,Opened At\nAAPL,LONG,EQUITY,10,150,2023-10-01T10:00:00Z";
    
    const res = await request(app.getHttpServer())
      .post('/imports')
      .set('x-mock-user-id', user.id)
      .attach('file', Buffer.from(csvContent), 'test.csv')
      .field('mappingTemplateId', templateId)
      .expect(201);

    expect(res.body.successCount).toBe(1);
    expect(res.body.skippedCount).toBe(0);
    expect(res.body.errorCount).toBe(0);
  });
});
