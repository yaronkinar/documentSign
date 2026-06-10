import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDocumentDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** When set, the document is built from a form template — no PDF upload. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  formTemplateId?: string;

  /** When set, copy PDF + layout from a saved PDF template (Mongo id). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  pdfTemplateId?: string;
}

export class ConfirmUploadDto {
  @IsInt()
  @Min(1)
  fileSize!: number;

  @IsInt()
  @Min(1)
  pageCount!: number;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class UpdateFormValuesDto {
  @IsObject()
  values!: Record<string, string>;
}

export class AttachFormTemplateDto {
  @IsString()
  @MaxLength(64)
  formTemplateId!: string;
}

export class CreateDocumentFormFieldDto {
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

export class UpdateDocumentFormFieldDto {
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
