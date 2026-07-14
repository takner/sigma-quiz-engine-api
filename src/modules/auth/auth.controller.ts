import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import {
  ErrorEnvelopeDto,
  LoginResponseDto,
  SafeUserDto,
} from '../../common/swagger/api-docs.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register a user account',
    description: 'Creates a USER account. Registration is rate limited.',
  })
  @ApiCreatedResponse({ type: SafeUserDto })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiConflictResponse({
    type: ErrorEnvelopeDto,
    description: 'EMAIL_ALREADY_EXISTS',
  })
  @ApiTooManyRequestsResponse({ type: ErrorEnvelopeDto })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async register(@Body() body: RegisterDto): Promise<unknown> {
    return this.authService.register(body.email, body.password);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Log in',
    description: 'Returns a bearer JWT for valid credentials.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiUnauthorizedResponse({
    type: ErrorEnvelopeDto,
    description: 'INVALID_CREDENTIALS',
  })
  @ApiTooManyRequestsResponse({ type: ErrorEnvelopeDto })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() body: LoginDto): Promise<unknown> {
    return this.authService.login(body.email, body.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user',
    description: 'Requires any authenticated ADMIN or USER account.',
  })
  @ApiOkResponse({ type: SafeUserDto })
  @ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.authService.getCurrentUser(user.id);
  }
}
