import { Type } from 'class-transformer';
import { IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

export class SubmitAttemptAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsInt()
  @Min(0)
  selectedOptionIndex!: number;
}

export class SubmitAttemptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitAttemptAnswerDto)
  answers!: SubmitAttemptAnswerDto[];
}
