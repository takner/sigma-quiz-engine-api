import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';
import { UserQuizzesController } from './user-quizzes.controller';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [QuizzesController, UserQuizzesController],
  providers: [QuizzesService],
})
export class QuizzesModule {}
