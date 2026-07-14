import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateQuestionDto {
  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt()
  @Min(1)
  position!: number;

  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    example: 'Which HTTP status means Not Found?',
  })
  @IsString()
  @Length(3, 500)
  questionText!: string;

  @ApiProperty({
    minItems: 2,
    maxItems: 10,
    example: ['200', '201', '404', '500'],
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  options!: string[];

  @ApiProperty({ minimum: 0, example: 2 })
  @IsInt()
  @Min(0)
  correctOptionIndex!: number;
}
