import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

export class SubmitAttemptAnswerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  questionId!: string;

  @ApiProperty({ minimum: 0, example: 2 })
  @IsInt()
  @Min(0)
  selectedOptionIndex!: number;
}

export class SubmitAttemptDto {
  @ApiProperty({ type: [SubmitAttemptAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitAttemptAnswerDto)
  answers!: SubmitAttemptAnswerDto[];
}
