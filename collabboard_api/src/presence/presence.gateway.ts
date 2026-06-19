import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { JwtPayload } from '../auth/auth.service';
import type { AuthenticatedSocket } from '../auth/guards/ws-jwt.guard';
import type { BoardNotification } from '../database/pg-notify.service';
import { NotesService } from '../notes/notes.service';
import { UsersService } from '../users/users.service';
import { PresenceService } from './presence.service';

type BoardBody = { boardId: string };
type HeartbeatBody = BoardBody & { cursorX?: number; cursorY?: number };
type TypingBody = BoardBody & { noteId: string };
type NoteUpdateBody = BoardBody & { noteId: string; currentVersion: number; [key: string]: unknown };

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  },
})
export class PresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly presence: PresenceService,
    private readonly notes: NotesService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      await this.ensureSocketUser(client);
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (!client.user) return;
    const userId = client.user.id;
    const rooms = [...client.rooms].filter((room) => room.startsWith('board:'));
    await Promise.all(rooms.map((room) => this.presence.leaveBoard(room.replace('board:', ''), userId, client.id)));
  }

  @SubscribeMessage('join_board')
  async joinBoard(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: BoardBody) {
    const user = await this.ensureSocketUser(client);
    await client.join(this.room(body.boardId));
    const state = await this.presence.joinBoard(body.boardId, user.id, client.id);
    client.emit('board_state', state);
    client.to(this.room(body.boardId)).emit('user_joined', { userId: user.id });
  }

  @SubscribeMessage('leave_board')
  async leaveBoard(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: BoardBody) {
    const user = await this.ensureSocketUser(client);
    await this.presence.leaveBoard(body.boardId, user.id, client.id);
    await client.leave(this.room(body.boardId));
    client.to(this.room(body.boardId)).emit('user_left', { userId: user.id });
  }

  @SubscribeMessage('heartbeat')
  async heartbeat(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: HeartbeatBody) {
    const user = await this.ensureSocketUser(client);
    await this.presence.heartbeat(body.boardId, user.id, client.id, body.cursorX, body.cursorY);
  }

  @SubscribeMessage('typing_start')
  async typingStart(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: TypingBody) {
    const user = await this.ensureSocketUser(client);
    await this.presence.setTyping(body.boardId, user.id, client.id, body.noteId, true);
  }

  @SubscribeMessage('typing_stop')
  async typingStop(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: TypingBody) {
    const user = await this.ensureSocketUser(client);
    await this.presence.setTyping(body.boardId, user.id, client.id, body.noteId, false);
  }

  @SubscribeMessage('note_update')
  async noteUpdate(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: NoteUpdateBody) {
    const user = await this.ensureSocketUser(client);
    const { boardId, noteId, currentVersion, ...fields } = body;
    try {
      await this.notes.updateFromSocket(boardId, noteId, currentVersion, fields, user.id);
    } catch (error) {
      const response = (error as { getResponse?: () => any })?.getResponse?.();
      if (response?.error === 'conflict') {
        client.emit('note_conflict', {
          noteId,
          currentVersion: response.current_version,
          currentNote: response.current_note,
        });
        return;
      }
      throw error;
    }
  }

  @OnEvent('pg.board_events')
  handleBoardNotify(event: BoardNotification) {
    const boardId = String(event.payload.board_id ?? event.payload.boardId ?? '');
    if (!boardId) return;
    const operation = String(event.payload.operation ?? event.payload.event ?? '').toLowerCase();
    const eventName = operation === 'insert' || operation === 'created' ? 'note_created' : operation === 'delete' || operation === 'deleted' ? 'note_deleted' : 'note_updated';
    this.server.to(this.room(boardId)).emit(eventName, event.payload);
  }

  @OnEvent('pg.presence_events')
  handlePresenceNotify(event: BoardNotification) {
    const boardId = String(event.payload.board_id ?? event.payload.boardId ?? '');
    if (!boardId) return;
    this.server.to(this.room(boardId)).emit('presence_updated', event.payload);
  }

  private room(boardId: string) {
    return `board:${boardId}`;
  }

  private async ensureSocketUser(client: AuthenticatedSocket): Promise<NonNullable<AuthenticatedSocket['user']>> {
    if (client.user) return client.user;
    const token = this.extractToken(client);
    const payload = await this.jwt.verifyAsync<JwtPayload>(token);
    const user = await this.users.getById(payload.sub);
    client.user = { id: user.id, email: user.email, username: user.username };
    return client.user;
  }

  private extractToken(client: AuthenticatedSocket) {
    const token = client.handshake.auth?.token ?? client.handshake.headers.authorization;
    if (typeof token !== 'string' || token.length === 0) {
      throw new Error('Missing token');
    }
    return token.replace(/^Bearer\s+/i, '');
  }
}
