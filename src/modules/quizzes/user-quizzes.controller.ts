import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe';
import {
  ErrorEnvelopeDto,
  PaginatedUserQuizDto,
  UserQuizDto,
} from '../../common/swagger/api-docs.dto';
import { QuizzesService } from './quizzes.service';

@ApiTags('User quizzes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ErrorEnvelopeDto, description: 'USER only' })
@Controller('quizzes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
export class UserQuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  @Get()
  @ApiOperation({
    summary: 'List published quizzes',
    description: 'Role: USER. Returns safe quiz metadata only.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ type: PaginatedUserQuizDto })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  async listAvailableQuizzes(
    @Query() query: { page?: string; limit?: string },
  ): Promise<unknown> {
    return this.quizzes.listAvailableQuizzes(query);
  }

  @Get(':quizId')
  @ApiOperation({
    summary: 'Preview a published quiz',
    description: 'Role: USER. Does not include questions or answer keys.',
  })
  @ApiParam({ name: 'quizId', format: 'uuid' })
  @ApiOkResponse({ type: UserQuizDto })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  async getAvailableQuizPreview(
    @Param('quizId', UuidParamPipe) quizId: string,
  ): Promise<unknown> {
    return this.quizzes.getAvailableQuizPreview(quizId);
  }
}
