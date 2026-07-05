import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { plainToInstance } from 'class-transformer';
import { IsNull } from 'typeorm';
import { BoardMember } from '../boards/board-member.entity';
import { BoardsService } from '../boards/boards.service';
import { DatabaseService } from '../database/database.service';
import { NoteResponseDto } from '../notes/dto/note.dto';
import { Note } from '../notes/note.entity';
import { ActiveBoardUser } from './active-board-user.entity';

type BoardMemberState = {
  userId: string;
  role: string;
  username: string;
  email: string;
  avatarColor: string;
};

type ActiveUserState = {
  userId: string;
  username: string;
  avatarColor: string;
  cursorX: number | null;
  cursorY: number | null;
  currentNoteId: string | null;
  isTyping: boolean;
};

@Injectable()
export class PresenceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly boards: BoardsService,
  ) {}

  async joinBoard(boardId: string, userId: string, socketId: string) {
    return this.db.runInRlsTransaction(userId, async () => {
      await this.boards.assertMember(boardId, userId);
      await this.upsertPresence(boardId, userId, socketId, {});
      return this.boardState(boardId, userId);
    });
  }

  async leaveBoard(boardId: string, userId: string, socketId: string) {
    return this.db.runInRlsTransaction(userId, async () => {
      await this.db.manager.delete(ActiveBoardUser, {
        boardId,
        userId,
        socketId,
      });
    });
  }

  async heartbeat(
    boardId: string,
    userId: string,
    socketId: string,
    cursorX?: number,
    cursorY?: number,
  ) {
    return this.db.runInRlsTransaction(userId, async () => {
      await this.boards.assertMember(boardId, userId);
      await this.upsertPresence(boardId, userId, socketId, {
        cursorX,
        cursorY,
      });
    });
  }

  async setTyping(
    boardId: string,
    userId: string,
    socketId: string,
    noteId: string,
    isTyping: boolean,
  ) {
    return this.db.runInRlsTransaction(userId, async () => {
      await this.boards.assertMember(boardId, userId);
      await this.upsertPresence(boardId, userId, socketId, {
        currentNoteId: isTyping ? noteId : null,
        isTyping,
        typingExpiresAt: isTyping ? new Date(Date.now() + 10000) : null,
      });
    });
  }

  async boardState(boardId: string, userId: string) {
    await this.boards.assertMember(boardId, userId);
    const [notes, members, activeUsers] = await Promise.all([
      this.db.manager.find(Note, {
        where: { boardId, deletedAt: IsNull() },
        order: { zIndex: 'ASC' },
      }),
      this.db.manager
        .createQueryBuilder(BoardMember, 'member')
        .innerJoin('member.user', 'user')
        .where('member.board_id = :boardId', { boardId })
        .select([
          'member.user_id AS "userId"',
          'member.role AS role',
          'user.username AS username',
          'user.email AS email',
          'user.avatar_color AS "avatarColor"',
        ])
        .getRawMany<BoardMemberState>(),
      this.activeUsers(boardId),
    ]);

    return {
      notes: plainToInstance(NoteResponseDto, notes, {
        excludeExtraneousValues: true,
      }),
      members,
      activeUsers,
    };
  }

  async activeUsers(boardId: string): Promise<ActiveUserState[]> {
    return this.db.manager
      .createQueryBuilder(ActiveBoardUser, 'presence')
      .innerJoin('presence.user', 'user')
      .where('presence.board_id = :boardId', { boardId })
      .select([
        'presence.user_id AS "userId"',
        'user.username AS username',
        'user.avatar_color AS "avatarColor"',
        'presence.cursor_x AS "cursorX"',
        'presence.cursor_y AS "cursorY"',
        'presence.current_note_id AS "currentNoteId"',
        'presence.is_typing AS "isTyping"',
      ])
      .getRawMany<ActiveUserState>();
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async cleanupStalePresence(): Promise<void> {
    await this.db.source.query<unknown[]>('SELECT fn_cleanup_stale_presence()');
  }

  private async upsertPresence(
    boardId: string,
    userId: string,
    socketId: string,
    patch: Partial<ActiveBoardUser>,
  ) {
    const hasCursorX = Object.hasOwn(patch, 'cursorX');
    const hasCursorY = Object.hasOwn(patch, 'cursorY');
    const hasCurrentNoteId = Object.hasOwn(patch, 'currentNoteId');
    const hasTyping = Object.hasOwn(patch, 'isTyping');
    const hasTypingExpiresAt = Object.hasOwn(patch, 'typingExpiresAt');

    await this.db.manager.query<unknown[]>(
      `
        INSERT INTO active_board_users (
          board_id,
          user_id,
          socket_id,
          last_heartbeat,
          cursor_x,
          cursor_y,
          current_note_id,
          is_typing,
          typing_expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT ON CONSTRAINT active_board_users_unique
        DO UPDATE SET
          socket_id = EXCLUDED.socket_id,
          last_heartbeat = EXCLUDED.last_heartbeat,
          cursor_x = CASE WHEN $10 THEN EXCLUDED.cursor_x ELSE active_board_users.cursor_x END,
          cursor_y = CASE WHEN $11 THEN EXCLUDED.cursor_y ELSE active_board_users.cursor_y END,
          current_note_id = CASE WHEN $12 THEN EXCLUDED.current_note_id ELSE active_board_users.current_note_id END,
          is_typing = CASE WHEN $13 THEN EXCLUDED.is_typing ELSE active_board_users.is_typing END,
          typing_expires_at = CASE WHEN $14 THEN EXCLUDED.typing_expires_at ELSE active_board_users.typing_expires_at END
      `,
      [
        boardId,
        userId,
        socketId,
        new Date(),
        patch.cursorX ?? null,
        patch.cursorY ?? null,
        patch.currentNoteId ?? null,
        patch.isTyping ?? false,
        patch.typingExpiresAt ?? null,
        hasCursorX,
        hasCursorY,
        hasCurrentNoteId,
        hasTyping,
        hasTypingExpiresAt,
      ],
    );
  }
}
