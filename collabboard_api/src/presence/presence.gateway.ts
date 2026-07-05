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
import { HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { JwtPayload } from '../auth/auth.service';
import type { AuthenticatedSocket } from '../auth/guards/ws-jwt.guard';
import type { BoardNotification } from '../database/pg-notify.service';
import { NoteLockService } from '../notes/note-lock.service';
import { NotesService } from '../notes/notes.service';
import { UsersService } from '../users/users.service';
import { PresenceService } from './presence.service';

type BoardBody = { boardId: string };
type HeartbeatBody = BoardBody & { cursorX?: number; cursorY?: number };
type CursorBody = BoardBody & { cursorX: number; cursorY: number };
type TypingBody = BoardBody & { noteId: string };
type NoteLockBody = BoardBody & { noteId: string };
type NoteUpdateBody = BoardBody & {
  noteId: string;
  currentVersion: number;
  [key: string]: unknown;
};

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  },
})
export class PresenceGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly presence: PresenceService,
    private readonly notes: NotesService,
    private readonly noteLocks: NoteLockService,
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
    const boardIds = Array.isArray(client.data.boardIds)
      ? client.data.boardIds
      : [];
    await Promise.all(
      boardIds.map((boardId) =>
        this.presence.leaveBoard(boardId, userId, client.id),
      ),
    );
    const locksByBoard = client.data.lockedNotesByBoard ?? {};
    await Promise.all(
      Object.entries(locksByBoard).flatMap(([boardId, noteIds]) =>
        noteIds.map(async (noteId) => {
          if (await this.noteLocks.release(noteId, userId)) {
            this.server
              .to(this.room(boardId))
              .emit('note_unlocked', { noteId });
          }
        }),
      ),
    );
  }

  @SubscribeMessage('join_board')
  async joinBoard(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: BoardBody,
  ) {
    const user = await this.ensureSocketUser(client);
    const state = await this.presence.joinBoard(
      body.boardId,
      user.id,
      client.id,
    );
    await client.join(this.room(body.boardId));
    client.data.boardIds = [
      ...new Set([...(client.data.boardIds ?? []), body.boardId]),
    ];
    client.emit('board_state', state);
    client.to(this.room(body.boardId)).emit('user_joined', {
      userId: user.id,
      username: user.username,
      avatarColor: user.avatarColor,
    });
  }

  @SubscribeMessage('leave_board')
  async leaveBoard(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: BoardBody,
  ) {
    const user = await this.ensureSocketUser(client);
    await this.presence.leaveBoard(body.boardId, user.id, client.id);
    await client.leave(this.room(body.boardId));
    client.data.boardIds = (client.data.boardIds ?? []).filter(
      (boardId: string) => boardId !== body.boardId,
    );
    client.to(this.room(body.boardId)).emit('user_left', { userId: user.id });
  }

  @SubscribeMessage('heartbeat')
  async heartbeat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: HeartbeatBody,
  ) {
    const user = await this.ensureSocketUser(client);
    await this.presence.heartbeat(
      body.boardId,
      user.id,
      client.id,
      body.cursorX,
      body.cursorY,
    );
  }

  @SubscribeMessage('cursor_move')
  async cursorMove(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: CursorBody,
  ) {
    const user = await this.ensureSocketUser(client);
    if (!client.rooms.has(this.room(body.boardId))) return;
    if (!Number.isFinite(body.cursorX) || !Number.isFinite(body.cursorY))
      return;
    client.to(this.room(body.boardId)).emit('cursor_moved', {
      userId: user.id,
      username: user.username,
      avatarColor: user.avatarColor,
      cursorX: Math.max(0, body.cursorX),
      cursorY: Math.max(0, body.cursorY),
    });
  }

  @SubscribeMessage('typing_start')
  async typingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: TypingBody,
  ) {
    const user = await this.ensureSocketUser(client);
    await Promise.all([
      this.presence.setTyping(
        body.boardId,
        user.id,
        client.id,
        body.noteId,
        true,
      ),
      this.noteLocks.renew(body.noteId, user.id),
    ]);
    client.to(this.room(body.boardId)).emit('typing_updated', {
      userId: user.id,
      username: user.username,
      avatarColor: user.avatarColor,
      currentNoteId: body.noteId,
      isTyping: true,
    });
  }

  @SubscribeMessage('typing_stop')
  async typingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: TypingBody,
  ) {
    const user = await this.ensureSocketUser(client);
    await this.presence.setTyping(
      body.boardId,
      user.id,
      client.id,
      body.noteId,
      false,
    );
    client.to(this.room(body.boardId)).emit('typing_updated', {
      userId: user.id,
      username: user.username,
      avatarColor: user.avatarColor,
      currentNoteId: null,
      isTyping: false,
    });
  }

  @SubscribeMessage('note_lock_request')
  async noteLockRequest(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: NoteLockBody,
  ): Promise<void> {
    const user = await this.ensureSocketUser(client);
    if (!client.rooms.has(this.room(body.boardId))) {
      client.emit('note_lock_denied', {
        noteId: body.noteId,
        heldBy: null,
      });
      return;
    }
    const acquired = await this.noteLocks.acquire(body.noteId, user.id);
    if (!acquired) {
      client.emit('note_lock_denied', {
        noteId: body.noteId,
        heldBy: await this.noteLocks.holder(body.noteId),
      });
      return;
    }

    this.trackSocketLock(client, body.boardId, body.noteId);
    this.server.to(this.room(body.boardId)).emit('note_locked', {
      noteId: body.noteId,
      userId: user.id,
      username: user.username,
    });
  }

  @SubscribeMessage('note_lock_release')
  async noteLockRelease(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: NoteLockBody,
  ): Promise<void> {
    const user = await this.ensureSocketUser(client);
    const released = await this.noteLocks.release(body.noteId, user.id);
    if (!released) return;

    this.untrackSocketLock(client, body.boardId, body.noteId);
    this.server
      .to(this.room(body.boardId))
      .emit('note_unlocked', { noteId: body.noteId });
  }

  @SubscribeMessage('note_update')
  async noteUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: NoteUpdateBody,
  ) {
    const user = await this.ensureSocketUser(client);
    const { boardId, noteId, currentVersion, ...fields } = body;
    try {
      const saved = await this.notes.updateFromSocket(
        boardId,
        noteId,
        currentVersion,
        fields,
        user.id,
      );
      this.server.to(this.room(boardId)).emit('note_updated', saved);
    } catch (error) {
      const response =
        error instanceof HttpException ? error.getResponse() : undefined;
      if (this.isRecord(response) && response.error === 'locked') {
        client.emit('note_lock_conflict', {
          noteId,
          heldBy: response.heldBy,
        });
        return;
      }
      if (this.isRecord(response) && response.error === 'conflict') {
        client.emit('note_conflict', {
          noteId,
          currentVersion: response.current_version,
          currentNote: response.current_note,
          attemptedPatch: response.attempted_patch ?? fields,
        });
        return;
      }
      client.emit('note_save_failed', {
        noteId,
        message: error instanceof Error ? error.message : 'Could not save note',
      });
    }
  }

  @OnEvent('pg.board_events')
  async handleBoardNotify(event: BoardNotification): Promise<void> {
    const boardId = this.valueAsString(
      event.payload.board_id ?? event.payload.boardId ?? '',
    );
    if (!boardId) return;
    const table = this.valueAsString(event.payload.table);
    const change = {
      id: this.valueAsString(event.payload.id),
      operation: this.valueAsString(
        event.payload.operation ?? event.payload.event ?? '',
      ).toLowerCase(),
    };
    if (table === 'board_members' && change.operation === 'delete') {
      const userId = this.valueAsString(
        event.payload.userId ?? event.payload.user_id,
      );
      if (userId) {
        await Promise.all([
          this.presence.removeUser(boardId, userId),
          this.kickBoardMember(boardId, userId),
        ]);
      }
    }

    this.server
      .to(this.room(boardId))
      .emit(
        table === 'notes' ? 'notes_invalidated' : 'board_invalidated',
        change,
      );
  }

  @OnEvent('pg.presence_events')
  handlePresenceNotify(event: BoardNotification) {
    const boardId = this.valueAsString(
      event.payload.board_id ?? event.payload.boardId ?? '',
    );
    if (!boardId) return;
    const operation = this.valueAsString(event.payload.operation).toLowerCase();
    if (operation === 'insert') {
      this.server.to(this.room(boardId)).emit('user_joined', {
        userId: this.valueAsString(
          event.payload.userId ?? event.payload.user_id,
        ),
      });
    } else if (operation === 'delete') {
      this.server.to(this.room(boardId)).emit('user_left', {
        userId: this.valueAsString(
          event.payload.userId ?? event.payload.user_id,
        ),
      });
    }
  }

  private room(boardId: string) {
    return `board:${boardId}`;
  }

  private async kickBoardMember(
    boardId: string,
    userId: string,
  ): Promise<void> {
    const room = this.room(boardId);
    const sockets = [...this.server.sockets.sockets.values()];
    const lockedNoteIds = new Set<string>();

    await Promise.all(
      sockets.map(async (socket) => {
        const client = socket as unknown as AuthenticatedSocket;
        if (client.user?.id !== userId || !client.rooms.has(room)) return;

        for (const noteId of client.data.lockedNotesByBoard?.[boardId] ?? []) {
          lockedNoteIds.add(noteId);
        }
        await client.leave(room);
        client.data.boardIds = (client.data.boardIds ?? []).filter(
          (joinedBoardId) => joinedBoardId !== boardId,
        );
        if (client.data.lockedNotesByBoard) {
          delete client.data.lockedNotesByBoard[boardId];
        }
        client.emit('board_access_revoked', { boardId });
      }),
    );

    for (const noteId of lockedNoteIds) {
      if (await this.noteLocks.release(noteId, userId)) {
        this.server.to(room).emit('note_unlocked', { noteId });
      }
    }
    this.server.to(room).emit('user_left', { userId });
  }

  private trackSocketLock(
    client: AuthenticatedSocket,
    boardId: string,
    noteId: string,
  ): void {
    const locksByBoard = (client.data.lockedNotesByBoard ??= {});
    locksByBoard[boardId] = [
      ...new Set([...(locksByBoard[boardId] ?? []), noteId]),
    ];
  }

  private untrackSocketLock(
    client: AuthenticatedSocket,
    boardId: string,
    noteId: string,
  ): void {
    const locksByBoard = client.data.lockedNotesByBoard;
    if (!locksByBoard) return;
    locksByBoard[boardId] = (locksByBoard[boardId] ?? []).filter(
      (lockedNoteId) => lockedNoteId !== noteId,
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private valueAsString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return '';
  }

  private async ensureSocketUser(
    client: AuthenticatedSocket,
  ): Promise<NonNullable<AuthenticatedSocket['user']>> {
    if (client.user) return client.user;
    const token = this.extractToken(client);
    const payload = await this.jwt.verifyAsync<JwtPayload>(token);
    const user = await this.users.getById(payload.sub);
    client.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      avatarColor: user.avatarColor,
    };
    return client.user;
  }

  private extractToken(client: AuthenticatedSocket) {
    const token =
      client.handshake.auth?.token ?? client.handshake.headers.authorization;
    if (typeof token !== 'string' || token.length === 0) {
      throw new Error('Missing token');
    }
    return token.replace(/^Bearer\s+/i, '');
  }
}
