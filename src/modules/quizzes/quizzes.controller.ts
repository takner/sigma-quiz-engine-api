import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { QuizzesService } from './quizzes.service';

@Controller('admin/quizzes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class QuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  @Post()
  async createQuiz(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateQuizDto,
  ): Promise<unknown> {
    return this.quizzes.createDraftQuiz(user.id, body);
  }

  @Get()
  async listQuizzes(
    @Query()
    query: {
      page?: string;
      limit?: string;
      status?: string;
      search?: string;
    },
  ): Promise<unknown> {
    return this.quizzes.listAdminQuizzes(query);
  }

  @Get(':quizId')
  async getQuiz(
    @Param('quizId', UuidParamPipe) quizId: string,
  ): Promise<unknown> {
    return this.quizzes.getAdminQuizDetail(quizId);
  }

  @Patch(':quizId')
  async updateQuiz(
    @Param('quizId', UuidParamPipe) quizId: string,
    @Body() body: UpdateQuizDto,
  ): Promise<unknown> {
    return this.quizzes.updateQuiz(quizId, body);
  }

  @Delete(':quizId')
  @HttpCode(204)
  async deleteQuiz(
    @Param('quizId', UuidParamPipe) quizId: string,
  ): Promise<void> {
    await this.quizzes.deleteQuiz(quizId);
  }

  @Post(':quizId/questions')
  async createQuestion(
    @Param('quizId', UuidParamPipe) quizId: string,
    @Body() body: CreateQuestionDto,
  ): Promise<unknown> {
    return this.quizzes.createQuestion(quizId, body);
  }

  @Post(':quizId/publish')
  @HttpCode(200)
  async publishQuiz(
    @Param('quizId', UuidParamPipe) quizId: string,
  ): Promise<unknown> {
    return this.quizzes.publishQuiz(quizId);
  }

  @Post(':quizId/archive')
  @HttpCode(200)
  async archiveQuiz(
    @Param('quizId', UuidParamPipe) quizId: string,
  ): Promise<unknown> {
    return this.quizzes.archiveQuiz(quizId);
  }

  @Patch(':quizId/questions/:questionId')
  async updateQuestion(
    @Param('quizId', UuidParamPipe) quizId: string,
    @Param('questionId', UuidParamPipe) questionId: string,
    @Body() body: UpdateQuestionDto,
  ): Promise<unknown> {
    return this.quizzes.updateQuestion(quizId, questionId, body);
  }

  @Delete(':quizId/questions/:questionId')
  @HttpCode(204)
  async deleteQuestion(
    @Param('quizId', UuidParamPipe) quizId: string,
    @Param('questionId', UuidParamPipe) questionId: string,
  ): Promise<void> {
    await this.quizzes.deleteQuestion(quizId, questionId);
  }
}
