import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ErrorDetailDto {
  @ApiProperty({ example: 'email' })
  field!: string;

  @ApiProperty({ example: 'must be an email' })
  issue!: string;
}

class ErrorBodyDto {
  @ApiProperty({ example: 'VALIDATION_FAILED' })
  code!: string;

  @ApiProperty({ example: 'Validation failed.' })
  message!: string;

  @ApiProperty({ type: [ErrorDetailDto] })
  details!: ErrorDetailDto[];

  @ApiProperty({ example: 'req_123' })
  requestId!: string;

  @ApiProperty({ example: '2026-07-14T12:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/api/v1/auth/register' })
  path!: string;
}

export class ErrorEnvelopeDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;
}

export class PaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  totalItems!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage!: boolean;
}

export class SafeUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ enum: ['ADMIN', 'USER'] })
  role!: 'ADMIN' | 'USER';

  @ApiPropertyOptional({ example: '2026-07-14T12:00:00.000Z' })
  createdAt?: string;
}

export class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ example: 3600 })
  expiresInSeconds!: number;

  @ApiProperty({ type: SafeUserDto })
  user!: SafeUserDto;
}

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: '2026-07-14T12:00:00.000Z' })
  timestamp!: string;
}

export class ReadinessResponseDto extends HealthResponseDto {
  @ApiProperty({ example: { database: 'ok' } })
  checks!: { database: 'ok' };
}

export class AdminQuestionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 1 })
  position!: number;

  @ApiProperty({ example: 'Which HTTP status means Not Found?' })
  questionText!: string;

  @ApiProperty({ example: ['200', '201', '404', '500'] })
  options!: string[];

  @ApiProperty({ example: 2 })
  correctOptionIndex!: number;
}

export class AdminQuizDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'HTTP Basics' })
  title!: string;

  @ApiProperty({ nullable: true, example: 'Foundational HTTP quiz.' })
  description!: string | null;

  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  status!: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @ApiProperty({ nullable: true, example: 900 })
  timeLimitSeconds!: number | null;

  @ApiProperty({ example: 5 })
  questionCount!: number;

  @ApiProperty({ nullable: true, example: '2026-07-14T12:00:00.000Z' })
  publishedAt!: string | null;

  @ApiProperty({ nullable: true, example: null })
  archivedAt!: string | null;

  @ApiProperty({ example: '2026-07-14T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-07-14T12:00:00.000Z' })
  updatedAt!: string;
}

export class AdminQuizDetailDto extends AdminQuizDto {
  @ApiProperty({ type: [AdminQuestionDto] })
  questions!: AdminQuestionDto[];
}

export class PaginatedAdminQuizDto {
  @ApiProperty({ type: [AdminQuizDto] })
  data!: AdminQuizDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

export class UserQuizDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'HTTP Basics' })
  title!: string;

  @ApiProperty({ nullable: true, example: 'Foundational HTTP quiz.' })
  description!: string | null;

  @ApiProperty({ example: 5 })
  questionCount!: number;

  @ApiProperty({ nullable: true, example: 900 })
  timeLimitSeconds!: number | null;
}

export class PaginatedUserQuizDto {
  @ApiProperty({ type: [UserQuizDto] })
  data!: UserQuizDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

export class AttemptQuestionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 1 })
  position!: number;

  @ApiProperty({ example: 'Which HTTP status means Not Found?' })
  questionText!: string;

  @ApiProperty({ example: ['200', '201', '404', '500'] })
  options!: string[];
}

export class AttemptQuizDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'HTTP Basics' })
  title!: string;

  @ApiProperty({ nullable: true, example: 'Foundational HTTP quiz.' })
  description!: string | null;
}

export class AttemptResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: AttemptQuizDto })
  quiz!: AttemptQuizDto;

  @ApiProperty({ enum: ['IN_PROGRESS'] })
  status!: 'IN_PROGRESS';

  @ApiProperty({ example: '2026-07-14T12:00:00.000Z' })
  startedAt!: string;

  @ApiProperty({ nullable: true, example: '2026-07-14T12:15:00.000Z' })
  expiresAt!: string | null;

  @ApiProperty({ example: false })
  resumed!: boolean;

  @ApiProperty({ type: [AttemptQuestionDto] })
  questions!: AttemptQuestionDto[];
}

export class ScoreDto {
  @ApiProperty({ example: 4 })
  correct!: number;

  @ApiProperty({ example: 5 })
  total!: number;

  @ApiProperty({ example: 80 })
  percentage!: number;
}

export class SubmittedAnswerDto {
  @ApiProperty({ format: 'uuid' })
  questionId!: string;

  @ApiProperty({ nullable: true, example: 2 })
  selectedOptionIndex!: number | null;

  @ApiProperty({ example: true })
  answered!: boolean;

  @ApiProperty({ example: true })
  isCorrect!: boolean;
}

export class SubmittedAttemptDto {
  @ApiProperty({ format: 'uuid' })
  attemptId!: string;

  @ApiProperty({ example: { id: 'uuid', title: 'HTTP Basics' } })
  quiz!: { id: string; title: string };

  @ApiProperty({ enum: ['SUBMITTED'] })
  status!: 'SUBMITTED';

  @ApiProperty({ example: '2026-07-14T12:10:00.000Z' })
  submittedAt!: string;

  @ApiProperty({ type: ScoreDto })
  score!: ScoreDto;

  @ApiProperty({ example: 5 })
  totalQuestions!: number;

  @ApiProperty({ example: 80 })
  percentage!: number;

  @ApiProperty({ type: [SubmittedAnswerDto] })
  answers!: SubmittedAnswerDto[];
}

export class ExpiredAttemptDto {
  @ApiProperty({ format: 'uuid' })
  attemptId!: string;

  @ApiProperty({ example: { id: 'uuid', title: 'HTTP Basics' } })
  quiz!: { id: string; title: string };

  @ApiProperty({ enum: ['EXPIRED'] })
  status!: 'EXPIRED';

  @ApiProperty({ example: '2026-07-14T12:00:00.000Z' })
  startedAt!: string;

  @ApiProperty({ nullable: true, example: '2026-07-14T12:15:00.000Z' })
  expiresAt!: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  submittedAt!: string | null;
}

export class HistoryItemDto {
  @ApiProperty({ format: 'uuid' })
  attemptId!: string;

  @ApiProperty({ format: 'uuid' })
  quizId!: string;

  @ApiProperty({ example: 'HTTP Basics' })
  quizTitle!: string;

  @ApiProperty({ enum: ['IN_PROGRESS', 'SUBMITTED', 'EXPIRED'] })
  status!: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';

  @ApiProperty({ type: ScoreDto, nullable: true })
  score!: ScoreDto | null;

  @ApiProperty({ example: '2026-07-14T12:00:00.000Z' })
  startedAt!: string;

  @ApiProperty({ nullable: true, example: '2026-07-14T12:10:00.000Z' })
  submittedAt!: string | null;
}

export class PaginatedHistoryDto {
  @ApiProperty({ type: [HistoryItemDto] })
  data!: HistoryItemDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}
