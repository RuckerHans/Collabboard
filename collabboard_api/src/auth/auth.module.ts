import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WsJwtGuard } from './guards/ws-jwt.guard';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        type JwtExpiry = NonNullable<
          JwtModuleOptions['signOptions']
        >['expiresIn'];
        return {
          secret: config.getOrThrow<string>('JWT_SECRET'),
          signOptions: {
            expiresIn: config.get<JwtExpiry>('JWT_EXPIRY') ?? '7d',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy, WsJwtGuard],
  exports: [AuthService, JwtModule, WsJwtGuard],
})
export class AuthModule {}
