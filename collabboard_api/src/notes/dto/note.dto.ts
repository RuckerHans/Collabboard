import { Expose } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateNoteDto {
  @IsOptional()
  @IsString()
  @Length(0, 200)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  positionX?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  positionY?: number;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  zIndex?: number;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class UpdateNoteDto {
  @IsInt()
  @Min(1)
  current_version: number;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class UpdateNotePositionDto {
  @IsInt()
  @Min(1)
  current_version: number;

  @IsNumber()
  @Min(0)
  positionX: number;

  @IsNumber()
  @Min(0)
  positionY: number;

  @IsInt()
  @Min(0)
  zIndex: number;
}

export class NoteParamDto {
  @IsUUID()
  boardId: string;

  @IsUUID()
  id: string;
}

export class NoteResponseDto {
  @Expose()
  id: string;

  @Expose()
  boardId: string;

  @Expose()
  createdBy: string;

  @Expose()
  title?: string;

  @Expose()
  content?: string;

  @Expose()
  color?: string;

  @Expose()
  positionX: number;

  @Expose()
  positionY: number;

  @Expose()
  width: number;

  @Expose()
  height: number;

  @Expose()
  zIndex: number;

  @Expose()
  version: number;

  @Expose()
  isPinned: boolean;

  @Expose()
  deletedAt?: Date | null;
}

export class NoteHistoryResponseDto {
  @Expose()
  id: string;

  @Expose()
  noteId: string;

  @Expose()
  boardId: string;

  @Expose()
  changedBy: string;

  @Expose()
  operation: string;

  @Expose()
  versionBefore?: number;

  @Expose()
  versionAfter?: number;

  @Expose()
  beforeSnapshot?: Record<string, unknown>;

  @Expose()
  afterSnapshot?: Record<string, unknown>;

  @Expose()
  changedFields?: string[];
}

