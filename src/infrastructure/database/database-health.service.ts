import { Injectable } from '@nestjs/common';

import { PrismaService } from './prisma.service';

@Injectable()
export class DatabaseHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async checkConnection(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
