import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTemplateDto {
  @IsString()
  name!: string;
}

export class ConfirmTemplateUploadDto {
  @IsNumber()
  fileSize!: number;

  @IsNumber()
  @IsOptional()
  pageCount?: number;
}

export class TemplateFieldInputDto {
  @IsString()
  label!: string;

  @IsNumber()
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
  @Min(1)
  @Max(100)
  width!: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  height!: number;
}

export class UpdateTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldInputDto)
  @IsOptional()
  fields?: TemplateFieldInputDto[];
}
