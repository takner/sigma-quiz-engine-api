import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnvironment } from './infrastructure/config/env.validation';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthModule } from './infrastructure/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AttemptsModule } from './modules/attempts/attempts.module';
import { QuizzesModule } from './modules/quizzes/quizzes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    QuizzesModule,
    AttemptsModule,
  ],
})
export class AppModule {}
