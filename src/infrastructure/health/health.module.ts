import { Module } from '@nestjs/common';

import { DatabaseHealthService } from '../database/database-health.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [DatabaseHealthService, HealthService],
})
export class HealthModule {}
