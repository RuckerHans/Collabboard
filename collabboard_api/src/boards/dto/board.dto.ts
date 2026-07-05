import { Expose, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import type { BoardRole } from '../board-member.entity';

export class CreateBoardDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;
}

export class UpdateBoardDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;
}

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(['editor', 'viewer'])
  role!: Extract<BoardRole, 'editor' | 'viewer'>;
}

export class UpdateMemberRoleDto {
  @IsIn(['editor', 'viewer'])
  role!: Extract<BoardRole, 'editor' | 'viewer'>;
}

export class BoardParamDto {
  @IsUUID()
  id!: string;
}

export class BoardMemberResponseDto {
  @Expose()
  id!: string;

  @Expose()
  userId!: string;

  @Expose()
  role!: BoardRole;

  @Expose()
  username?: string;

  @Expose()
  email?: string;

  @Expose()
  avatarColor?: string;
}

export class BoardResponseDto {
  @Expose()
  id!: string;

  @Expose()
  name!: string;

  @Expose()
  description?: string;

  @Expose()
  ownerId!: string;

  @Expose()
  isArchived!: boolean;

  @Expose()
  memberCount?: number;

  @Expose()
  lastActivity?: string | null;

  @Expose()
  @Type(() => BoardMemberResponseDto)
  members?: BoardMemberResponseDto[];
}
