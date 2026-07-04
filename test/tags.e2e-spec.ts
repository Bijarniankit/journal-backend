import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TagsModule } from '../src/modules/tags/tags.module';
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

describe('TagsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const user1 = { id: 'e2e-tag-user-1' };
  const user2 = { id: 'e2e-tag-user-2' };
  let tagId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }), PrismaModule, TagsModule],
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
    await prisma.tag.deleteMany({ where: { userId: { in: [user1.id, user2.id] } } });
    await app.close();
  });

  it('POST /tags - creates a tag', async () => {
    const res = await request(app.getHttpServer())
      .post('/tags')
      .set('x-mock-user-id', user1.id)
      .send({ name: 'FOMO' })
      .expect(201);
    
    expect(res.body.name).toBe('FOMO');
    tagId = res.body.id;
  });

  it('GET /tags - lists tags', async () => {
    const res = await request(app.getHttpServer())
      .get('/tags')
      .set('x-mock-user-id', user1.id)
      .expect(200);
    
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(tagId);
  });

  it('DELETE /tags/:id - deletes tag', async () => {
    await request(app.getHttpServer())
      .delete(`/tags/${tagId}`)
      .set('x-mock-user-id', user1.id)
      .expect(200);
  });
});
