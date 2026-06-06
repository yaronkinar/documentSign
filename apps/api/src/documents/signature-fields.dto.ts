import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateSignatureFieldDto {
  @IsString()
  stepId!: string;

  @IsString()
  signerId!: string;

  @IsInt()
  @Min(1)
  pageNumber!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  x!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  y!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  height?: number;

  @IsOptional()
  @IsString()
  label?: string;
}

export class UpdateSignatureFieldDto {
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
  @IsNumber()
  @Min(1)
  @Max(100)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  height?: number;
}
