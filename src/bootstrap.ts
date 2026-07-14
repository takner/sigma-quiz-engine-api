import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { createValidationException } from './common/errors/validation-exception.factory';
import { HttpErrorFilter } from './common/filters/http-error.filter';
import { createHttpLogger } from './common/logging/http-logger';
import { requestIdMiddleware } from './common/logging/request-id.middleware';
import { EnvironmentConfig } from './infrastructure/config/env.validation';

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService<EnvironmentConfig, true>);

  app.use(requestIdMiddleware);
  app.use(createHttpLogger());
  app.use(helmet());
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
  });
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'api/docs', method: RequestMethod.GET },
      { path: 'api/docs-json', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
      exceptionFactory: createValidationException,
    }),
  );
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();

  const openApiDocument = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Quiz Engine API')
      .setDescription('Quiz Engine API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );

  SwaggerModule.setup('api/docs', app, openApiDocument, {
    jsonDocumentUrl: 'api/docs-json',
  });
}
