import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnvironment } from './infrastructure/config/env.validation';
import { HealthModule } from './infrastructure/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    HealthModule,
  ],
})
export class AppModule {}
