import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';

import { ApplicationException } from '../../common/errors/application.exception';
import { EnvironmentConfig } from '../../infrastructure/config/env.validation';
import { UsersService } from '../users/users.service';

interface SafeUserResponse {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
  createdAt?: string;
}

interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
  user: SafeUserResponse;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentConfig, true>,
  ) {}

  async register(email: string, password: string): Promise<SafeUserResponse> {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    try {
      const user = await this.users.createUser({
        email,
        passwordHash,
      });
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ApplicationException(
          HttpStatus.CONFLICT,
          'EMAIL_ALREADY_EXISTS',
          'Email is already registered.',
        );
      }
      throw error;
    }
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.users.findByEmail(email);
    const passwordMatches = user
      ? await argon2.verify(user.passwordHash, password)
      : false;

    if (!user || !passwordMatches) {
      throw new ApplicationException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'Invalid email or password.',
      );
    }

    const expiresInSeconds = this.config.get('JWT_EXPIRES_IN', {
      infer: true,
    });
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      {
        expiresIn: expiresInSeconds,
        secret: this.config.get('JWT_SECRET', { infer: true }),
      },
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSeconds,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async getCurrentUser(userId: string): Promise<SafeUserResponse> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ApplicationException(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'User does not exist.',
      );
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
