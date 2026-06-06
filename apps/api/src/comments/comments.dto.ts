import {
  IsArray,
  IsBoolean,
  IsEmail,
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

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  mentionedEmails?: string[];
}

/** Dev-only (BYPASS_AUTH). Triggers comment notification emails without creating a comment. */
export class DevTestCommentNotifyDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsEnum(['general', 'annotation', 'rejection_reason', 'approval_note'])
  type?: CreateCommentDto['type'];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  mentionedEmails?: string[];

  /** Simulate a different comment author (defaults to the authenticated dev user). */
  @IsOptional()
  @IsEmail()
  authorEmail?: string;

  @IsOptional()
  @IsString()
  authorName?: string;

  @IsOptional()
  @IsString()
  authorClerkId?: string;

  /** Use when the owner is not in the users DB (common with auth bypass). */
  @IsOptional()
  @IsEmail()
  ownerEmailOverride?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
