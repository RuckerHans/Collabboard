import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../auth.service';

type AuthenticatedSocketData = {
  boardIds?: string[];
};

export type AuthenticatedSocket = Omit<Socket, 'data' | 'handshake'> & {
  data: AuthenticatedSocketData;
  handshake: Omit<Socket['handshake'], 'auth'> & {
    auth: { token?: unknown };
  };
  user?: { id: string; email: string; username: string; avatarColor: string };
};

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<AuthenticatedSocket>();
    const token = this.extractToken(client);
    if (!token) {
      throw new UnauthorizedException('Missing WebSocket token');
    }
    const payload = await this.jwt.verifyAsync<JwtPayload>(token);
    const user = await this.users.getById(payload.sub);
    client.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      avatarColor: user.avatarColor,
    };
    return true;
  }

  private extractToken(client: AuthenticatedSocket): string | undefined {
    const authToken = client.handshake.auth.token;
    if (typeof authToken === 'string') {
      return authToken.replace(/^Bearer\s+/i, '');
    }
    const header = client.handshake.headers.authorization;
    return header?.replace(/^Bearer\s+/i, '');
  }
}
