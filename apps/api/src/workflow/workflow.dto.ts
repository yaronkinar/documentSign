import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SignerInputDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class AddStepDto {
  @IsString()
  @MaxLength(120)
  label!: string;

  @IsEnum(['review', 'signature', 'approval', 'notification'])
  stepType!: 'review' | 'signature' | 'approval' | 'notification';

  @IsOptional()
  @IsEnum(['sequential', 'parallel'])
  executionMode?: 'sequential' | 'parallel';

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SignerInputDto)
  signers!: SignerInputDto[];
}

export class AddSignerDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class RejectDocumentDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}
