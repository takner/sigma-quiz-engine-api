import { HttpStatus, Injectable } from '@nestjs/common';

import { ApplicationException } from '../../common/errors/application.exception';
import { DatabaseHealthService } from '../database/database-health.service';

@Injectable()
export class HealthService {
  constructor(private readonly databaseHealth: DatabaseHealthService) {}

  getLiveness(): { status: 'ok'; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<{
    status: 'ok';
    checks: { database: 'ok' };
    timestamp: string;
  }> {
    try {
      await this.databaseHealth.checkConnection();
    } catch {
      throw new ApplicationException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'SERVICE_NOT_READY',
        'Database connection is not ready.',
      );
    }

    return {
      status: 'ok',
      checks: {
        database: 'ok',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
