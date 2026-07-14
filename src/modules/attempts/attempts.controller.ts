import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { OptionalUuidQueryPipe } from '../../common/pipes/optional-uuid-query.pipe';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe';
import {
  AttemptResponseDto,
  ErrorEnvelopeDto,
  ExpiredAttemptDto,
  PaginatedHistoryDto,
  SubmittedAttemptDto,
} from '../../common/swagger/api-docs.dto';
import { AttemptsService } from './attempts.service';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';

@ApiTags('Attempts')
@ApiExtraModels(AttemptResponseDto, SubmittedAttemptDto, ExpiredAttemptDto)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ErrorEnvelopeDto, description: 'USER only' })
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Post('quizzes/:quizId/attempts')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Start or resume an attempt',
    description:
      'Role: USER. Creates a question snapshot for new attempts and resumes the existing open attempt for the same quiz.',
  })
  @ApiParam({ name: 'quizId', format: 'uuid' })
  @ApiCreatedResponse({ type: AttemptResponseDto })
  @ApiOkResponse({
    type: AttemptResponseDto,
    description: 'Existing open attempt resumed.',
  })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
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
  @ApiOperation({
    summary: 'Get attempt',
    description:
      'Role: USER. Lazily expires open attempts and returns a safe projection.',
  })
  @ApiParam({ name: 'attemptId', format: 'uuid' })
  @ApiOkResponse({
    description: 'Returns an in-progress, submitted, or expired attempt shape.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(AttemptResponseDto) },
        { $ref: getSchemaPath(SubmittedAttemptDto) },
        { $ref: getSchemaPath(ExpiredAttemptDto) },
      ],
    },
  })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  @ApiForbiddenResponse({
    type: ErrorEnvelopeDto,
    description: 'ATTEMPT_NOT_OWNED',
  })
  async getAttempt(
    @Param('attemptId', UuidParamPipe) attemptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.attempts.getAttempt(user.id, attemptId);
  }

  @Post('attempts/:attemptId/submit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Submit an attempt',
    description:
      'Role: USER. Scores against the stored attempt snapshot using an atomic transaction.',
  })
  @ApiParam({ name: 'attemptId', format: 'uuid' })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description:
      'Optional key for replaying the same successful submit response within 24 hours.',
  })
  @ApiOkResponse({ type: SubmittedAttemptDto })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  @ApiForbiddenResponse({
    type: ErrorEnvelopeDto,
    description: 'ATTEMPT_NOT_OWNED',
  })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  async submitAttempt(
    @Param('attemptId', UuidParamPipe) attemptId: string,
    @Body() body: SubmitAttemptDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<unknown> {
    return this.attempts.submitAttempt(
      user.id,
      attemptId,
      body,
      idempotencyKey,
    );
  }

  @Get('users/me/quiz-history')
  @ApiOperation({
    summary: 'List my quiz history',
    description:
      'Role: USER. Lazily expires open attempts before returning paginated history.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'quizId', required: false, format: 'uuid' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['IN_PROGRESS', 'SUBMITTED', 'EXPIRED'],
  })
  @ApiOkResponse({ type: PaginatedHistoryDto })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  async listHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('quizId', OptionalUuidQueryPipe) quizId?: string,
    @Query('status') status?: string,
  ): Promise<unknown> {
    return this.attempts.listHistory(user.id, {
      page,
      limit,
      quizId,
      status,
    });
  }

  @Get('users/me/quiz-history/:attemptId')
  @ApiOperation({
    summary: 'Get history detail',
    description:
      'Role: USER. Returns the same safe attempt detail shape used by GET /attempts/{attemptId}.',
  })
  @ApiParam({ name: 'attemptId', format: 'uuid' })
  @ApiOkResponse({
    description: 'Returns an in-progress, submitted, or expired attempt shape.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(AttemptResponseDto) },
        { $ref: getSchemaPath(SubmittedAttemptDto) },
        { $ref: getSchemaPath(ExpiredAttemptDto) },
      ],
    },
  })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  @ApiForbiddenResponse({
    type: ErrorEnvelopeDto,
    description: 'ATTEMPT_NOT_OWNED',
  })
  async getHistoryDetail(
    @Param('attemptId', UuidParamPipe) attemptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.attempts.getHistoryDetail(user.id, attemptId);
  }
}
