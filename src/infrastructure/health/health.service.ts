import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getLiveness(): { status: 'ok'; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  getReadiness(): {
    status: 'ok';
    checks: { application: 'ok'; configuration: 'ok' };
    timestamp: string;
  } {
    return {
      status: 'ok',
      checks: {
        application: 'ok',
        configuration: 'ok',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
