import { Expose, Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(3, 40)
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  avatarColor?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class UserResponseDto {
  @Expose()
  id!: string;

  @Expose()
  username!: string;

  @Expose()
  email!: string;

  @Expose()
  avatarColor!: string;

  @Expose()
  isActive!: boolean;
}

export class AuthResponseDto {
  @Expose()
  access_token!: string;

  @Expose()
  @Type(() => UserResponseDto)
  user!: UserResponseDto;
}
