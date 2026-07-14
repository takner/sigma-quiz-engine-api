import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe';
import { AttemptsService } from './attempts.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Post('quizzes/:quizId/attempts')
  @HttpCode(201)
  async startAttempt(
    @Param('quizId', UuidParamPipe) quizId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    const result = await this.attempts.startOrResumeAttempt(user.id, quizId);
    response.status(result.statusCode);
    return result.body;
  }

  @Get('attempts/:attemptId')
  async getAttempt(
    @Param('attemptId', UuidParamPipe) attemptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.attempts.getAttempt(user.id, attemptId);
  }
}
