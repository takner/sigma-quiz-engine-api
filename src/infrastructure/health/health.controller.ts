import { Controller, Get } from '@nestjs/common';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  getLiveness(): { status: 'ok'; timestamp: string } {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  async getReadiness(): Promise<{
    status: 'ok';
    checks: { database: 'ok' };
    timestamp: string;
  }> {
    return this.healthService.getReadiness();
  }
}
