import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSignerProfileDto {
  @IsString()
  @MaxLength(120)
  templateId!: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdateSignerProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;
}

export class ConfirmProfileSignatureDto {
  @IsString()
  imageKey!: string;
}
