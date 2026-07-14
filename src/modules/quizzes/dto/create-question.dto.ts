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
  @IsInt()
  @Min(1)
  position!: number;

  @IsString()
  @Length(3, 500)
  questionText!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  options!: string[];

  @IsInt()
  @Min(0)
  correctOptionIndex!: number;
}
