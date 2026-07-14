import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  ErrorEnvelopeDto,
  HealthResponseDto,
  ReadinessResponseDto,
} from '../../common/swagger/api-docs.dto';

import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOperation({
    summary: 'Liveness check',
    description: 'Confirms the API process is running.',
  })
  @ApiOkResponse({ type: HealthResponseDto })
  getLiveness(): { status: 'ok'; timestamp: string } {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness check',
    description: 'Confirms PostgreSQL connectivity for serving traffic.',
  })
  @ApiOkResponse({ type: ReadinessResponseDto })
  @ApiServiceUnavailableResponse({
    type: ErrorEnvelopeDto,
    description: 'SERVICE_NOT_READY',
  })
  async getReadiness(): Promise<{
    status: 'ok';
    checks: { database: 'ok' };
    timestamp: string;
  }> {
    return this.healthService.getReadiness();
  }
}
