import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ZodValidationPipe } from 'nestjs-zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:3001');

  // Security
  app.use(helmet());
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Global error envelope & validation
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(new ZodValidationPipe());

  // ─── Swagger / OpenAPI ────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Trading Journal API')
    .setDescription(
      'REST API for the Trading Journal application. ' +
      'All endpoints require a valid Supabase JWT unless marked as public.',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your Supabase access token',
      },
      'supabase-jwt',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port);
  console.log(`🚀 Journal API running on http://localhost:${port}`);
  console.log(`📖 Swagger UI available at http://localhost:${port}/api-docs`);
}
bootstrap();
