import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe';
import { QuizzesService } from './quizzes.service';

@Controller('quizzes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
export class UserQuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  @Get()
  async listAvailableQuizzes(
    @Query() query: { page?: string; limit?: string },
  ): Promise<unknown> {
    return this.quizzes.listAvailableQuizzes(query);
  }

  @Get(':quizId')
  async getAvailableQuizPreview(
    @Param('quizId', UuidParamPipe) quizId: string,
  ): Promise<unknown> {
    return this.quizzes.getAvailableQuizPreview(quizId);
  }
}
