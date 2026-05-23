import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
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
