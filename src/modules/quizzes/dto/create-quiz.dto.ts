import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateQuizDto {
  @ApiProperty({ minLength: 3, maxLength: 120, example: 'HTTP Basics' })
  @IsString()
  @Length(3, 120)
  title!: string;

  @ApiPropertyOptional({
    minLength: 0,
    maxLength: 1000,
    nullable: true,
    example: 'Foundational HTTP quiz.',
  })
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string | null;

  @ApiPropertyOptional({ minimum: 60, maximum: 86400, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86400)
  timeLimitSeconds?: number | null;
}
