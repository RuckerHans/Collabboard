import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Public } from '../database/rls-transaction.interceptor';
import { User } from '../users/user.entity';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, UserResponseDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() request: { user: User }) {
    return plainToInstance(UserResponseDto, request.user, {
      excludeExtraneousValues: true,
    });
  }
}
