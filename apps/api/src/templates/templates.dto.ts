import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTemplateDto {
  @IsString()
  name!: string;
}

export class CreateTemplateFromDocumentDto {
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

export class CreateTemplateFormFieldDto {
  @IsString()
  @MaxLength(200)
  label!: string;

  @IsOptional()
  @IsIn(['text', 'textarea', 'date'])
  type?: 'text' | 'textarea' | 'date';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  section?: string;

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
}

export class UpdateTemplateFormFieldDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsIn(['text', 'textarea', 'date'])
  type?: 'text' | 'textarea' | 'date';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  section?: string;

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
  @Min(0)
  @Max(100)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  height?: number;
}
