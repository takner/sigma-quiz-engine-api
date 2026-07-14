import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class UpdateQuestionDto {
  @ApiPropertyOptional({ minimum: 1, example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;

  @ApiPropertyOptional({
    minLength: 3,
    maxLength: 500,
    example: 'Which HTTP status means Not Found?',
  })
  @IsOptional()
  @IsString()
  @Length(3, 500)
  questionText?: string;

  @ApiPropertyOptional({
    minItems: 2,
    maxItems: 10,
    example: ['200', '201', '404', '500'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({ minimum: 0, example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  correctOptionIndex?: number;
}
