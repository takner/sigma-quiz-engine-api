import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateQuizDto {
  @IsString()
  @Length(3, 120)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86400)
  timeLimitSeconds?: number | null;
}
