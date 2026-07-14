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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe';
import {
  AdminQuestionDto,
  AdminQuizDetailDto,
  AdminQuizDto,
  ErrorEnvelopeDto,
  PaginatedAdminQuizDto,
} from '../../common/swagger/api-docs.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { QuizzesService } from './quizzes.service';

@ApiTags('Admin quizzes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ErrorEnvelopeDto, description: 'ADMIN only' })
@Controller('admin/quizzes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class QuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create draft quiz',
    description: 'Role: ADMIN. Creates a mutable DRAFT quiz.',
  })
  @ApiCreatedResponse({ type: AdminQuizDto })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  async createQuiz(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateQuizDto,
  ): Promise<unknown> {
    return this.quizzes.createDraftQuiz(user.id, body);
  }

  @Get()
  @ApiOperation({
    summary: 'List admin quizzes',
    description: 'Role: ADMIN. Supports pagination, status, and title search.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  })
  @ApiQuery({ name: 'search', required: false, example: 'HTTP' })
  @ApiOkResponse({ type: PaginatedAdminQuizDto })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
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
  @ApiOperation({
    summary: 'Get admin quiz detail',
    description: 'Role: ADMIN. Includes questions and correct answer indexes.',
  })
  @ApiParam({ name: 'quizId', format: 'uuid' })
  @ApiOkResponse({ type: AdminQuizDetailDto })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  async getQuiz(
    @Param('quizId', UuidParamPipe) quizId: string,
  ): Promise<unknown> {
    return this.quizzes.getAdminQuizDetail(quizId);
  }

  @Patch(':quizId')
  @ApiOperation({
    summary: 'Update draft quiz metadata',
    description: 'Role: ADMIN. Published or archived quizzes are immutable.',
  })
  @ApiParam({ name: 'quizId', format: 'uuid' })
  @ApiOkResponse({ type: AdminQuizDto })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  async updateQuiz(
    @Param('quizId', UuidParamPipe) quizId: string,
    @Body() body: UpdateQuizDto,
  ): Promise<unknown> {
    return this.quizzes.updateQuiz(quizId, body);
  }

  @Delete(':quizId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a safe draft quiz',
    description:
      'Role: ADMIN. Only never-published draft quizzes without attempts can be deleted.',
  })
  @ApiParam({ name: 'quizId', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  async deleteQuiz(
    @Param('quizId', UuidParamPipe) quizId: string,
  ): Promise<void> {
    await this.quizzes.deleteQuiz(quizId);
  }

  @Post(':quizId/questions')
  @ApiOperation({
    summary: 'Create draft question',
    description: 'Role: ADMIN. Only DRAFT quizzes can be changed.',
  })
  @ApiParam({ name: 'quizId', format: 'uuid' })
  @ApiCreatedResponse({ type: AdminQuestionDto })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  async createQuestion(
    @Param('quizId', UuidParamPipe) quizId: string,
    @Body() body: CreateQuestionDto,
  ): Promise<unknown> {
    return this.quizzes.createQuestion(quizId, body);
  }

  @Post(':quizId/publish')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Publish draft quiz',
    description:
      'Role: ADMIN. Requires at least one valid question and locks content.',
  })
  @ApiParam({ name: 'quizId', format: 'uuid' })
  @ApiOkResponse({ type: AdminQuizDto })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  async publishQuiz(
    @Param('quizId', UuidParamPipe) quizId: string,
  ): Promise<unknown> {
    return this.quizzes.publishQuiz(quizId);
  }

  @Post(':quizId/archive')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Archive quiz',
    description:
      'Role: ADMIN. Blocks new attempts while preserving existing attempts and history.',
  })
  @ApiParam({ name: 'quizId', format: 'uuid' })
  @ApiOkResponse({ type: AdminQuizDto })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  async archiveQuiz(
    @Param('quizId', UuidParamPipe) quizId: string,
  ): Promise<unknown> {
    return this.quizzes.archiveQuiz(quizId);
  }

  @Patch(':quizId/questions/:questionId')
  @ApiOperation({
    summary: 'Update draft question',
    description: 'Role: ADMIN. Only DRAFT quizzes can be changed.',
  })
  @ApiParam({ name: 'quizId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiOkResponse({ type: AdminQuestionDto })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  async updateQuestion(
    @Param('quizId', UuidParamPipe) quizId: string,
    @Param('questionId', UuidParamPipe) questionId: string,
    @Body() body: UpdateQuestionDto,
  ): Promise<unknown> {
    return this.quizzes.updateQuestion(quizId, questionId, body);
  }

  @Delete(':quizId/questions/:questionId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete draft question',
    description: 'Role: ADMIN. Only DRAFT quizzes can be changed.',
  })
  @ApiParam({ name: 'quizId', format: 'uuid' })
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  async deleteQuestion(
    @Param('quizId', UuidParamPipe) quizId: string,
    @Param('questionId', UuidParamPipe) questionId: string,
  ): Promise<void> {
    await this.quizzes.deleteQuestion(quizId, questionId);
  }
}
