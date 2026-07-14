import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApplication } from './bootstrap';
import { EnvironmentConfig } from './infrastructure/config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService<EnvironmentConfig, true>);

  configureApplication(app);

  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
