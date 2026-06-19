import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from './dto/auth.dto';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';

export type JwtPayload = { sub: string; email: string; username: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: {
    email: string;
    username: string;
    password: string;
    avatarColor?: string;
  }) {
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await this.users.createLocalUser({
      email: input.email,
      username: input.username,
      passwordHash,
      avatarColor: input.avatarColor,
    });
    return this.buildAuthResponse(user);
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.buildAuthResponse(user);
  }

  async validateJwt(payload: JwtPayload): Promise<User> {
    return this.users.getById(payload.sub);
  }

  buildAuthResponse(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
    };
    return {
      access_token: this.jwt.sign(payload),
      user: plainToInstance(UserResponseDto, user, {
        excludeExtraneousValues: true,
      }),
    };
  }
}
