import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class GetSignatureUploadUrlDto {
  @IsEnum(['drawn', 'typed', 'uploaded'])
  type!: 'drawn' | 'typed' | 'uploaded';
}

export class ConfirmSavedSignatureDto {
  @IsString()
  @MaxLength(80)
  label!: string;

  @IsEnum(['drawn', 'typed', 'uploaded'])
  type!: 'drawn' | 'typed' | 'uploaded';

  @IsOptional()
  @IsBoolean()
  setDefault?: boolean;
}

export class UpdateSavedSignatureLabelDto {
  @IsString()
  @MaxLength(80)
  label!: string;
}
