import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class PlaceSignatureDto {
  @IsString()
  documentId!: string;

  @IsString()
  stepId!: string;

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

  @IsNumber()
  @Min(0)
  @Max(100)
  width!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  height!: number;

  @IsString()
  imageKey!: string;

  @IsOptional()
  @IsString()
  savedSignatureId?: string;

  @IsOptional()
  @IsString()
  signatureFieldId?: string;
}

export class GuestSigUploadUrlDto {
  @IsOptional()
  @IsString()
  contentType?: string;
}
