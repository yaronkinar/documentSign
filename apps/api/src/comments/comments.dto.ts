import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MaxLength(5000)
  content!: string;

  @IsEnum(['general', 'annotation', 'rejection_reason', 'approval_note'])
  type!: 'general' | 'annotation' | 'rejection_reason' | 'approval_note';

  @IsOptional()
  @IsInt()
  @Min(1)
  pageNumber?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  x?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  y?: number;

  @IsOptional()
  @IsString()
  parentId?: string;
}
