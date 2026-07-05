import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { IsNull } from 'typeorm';
import { BoardMember } from '../boards/board-member.entity';
import { BoardsService } from '../boards/boards.service';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../database/redis.service';
import { NoteResponseDto } from '../notes/dto/note.dto';
import { Note } from '../notes/note.entity';

type BoardMemberState = {
  userId: string;
  role: string;
  username: string;
  email: string;
  avatarColor: string;
};

type RedisPresence = {
  socketId: string;
  cursorX: number | null;
  cursorY: number | null;
  currentNoteId: string | null;
  isTyping: boolean;
  lastHeartbeat: number;
};

type ActiveUserState = Omit<RedisPresence, 'socketId' | 'lastHeartbeat'> & {
  userId: string;
  username: string;
  avatarColor: string;
};

type NoteLockState = {
  userId: string;
  username: string;
};

const STALE_AFTER_MS = 60_000;

@Injectable()
export class PresenceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly boards: BoardsService,
    private readonly redis: RedisService,
  ) {}

  async joinBoard(boardId: string, userId: string, socketId: string) {
    return this.db.runInRlsTransaction(userId, async () => {
      await this.boards.assertMember(boardId, userId);
      await this.upsertPresence(boardId, userId, socketId);
      return this.loadBoardState(boardId);
    });
  }

  async leaveBoard(
    boardId: string,
    userId: string,
    socketId: string,
  ): Promise<void> {
    const key = this.presenceKey(boardId);
    const current = await this.readPresence(key, userId);
    if (current?.socketId === socketId) {
      await this.redis.client.hDel(key, userId);
    }
  }

  async removeUser(boardId: string, userId: string): Promise<void> {
    await this.redis.client.hDel(this.presenceKey(boardId), userId);
  }

  async heartbeat(
    boardId: string,
    userId: string,
    socketId: string,
    cursorX?: number,
    cursorY?: number,
  ): Promise<void> {
    await this.updatePresence(boardId, userId, socketId, {
      cursorX: cursorX ?? null,
      cursorY: cursorY ?? null,
    });
  }

  async setTyping(
    boardId: string,
    userId: string,
    socketId: string,
    noteId: string,
    isTyping: boolean,
  ): Promise<void> {
    await this.updatePresence(boardId, userId, socketId, {
      currentNoteId: isTyping ? noteId : null,
      isTyping,
    });
  }

  async boardState(boardId: string, userId: string) {
    return this.db.runInRlsTransaction(userId, async () => {
      await this.boards.assertMember(boardId, userId);
      return this.loadBoardState(boardId);
    });
  }

  async activeUsers(
    boardId: string,
  ): Promise<Array<RedisPresence & { userId: string }>> {
    const key = this.presenceKey(boardId);
    const entries = await this.redis.client.hGetAll(key);
    const now = Date.now();
    const active: Array<RedisPresence & { userId: string }> = [];
    const staleOrInvalid: string[] = [];

    for (const [userId, value] of Object.entries(entries)) {
      const presence = this.parsePresence(value);
      if (!presence || now - presence.lastHeartbeat > STALE_AFTER_MS) {
        staleOrInvalid.push(userId);
        continue;
      }
      active.push({ userId, ...presence });
    }

    if (staleOrInvalid.length > 0) {
      await this.redis.client.hDel(key, staleOrInvalid);
    }

    return active;
  }

  private async loadBoardState(boardId: string) {
    const [notes, members, presence] = await Promise.all([
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
    const membersByUserId = new Map(
      members.map((member) => [member.userId, member]),
    );
    const noteIds = notes.map((note) => note.id);
    const lockHolders =
      noteIds.length > 0
        ? await this.redis.client.mGet(
            noteIds.map((noteId) => `note:${noteId}:lock`),
          )
        : [];
    const noteLocks: Record<string, NoteLockState> = {};
    noteIds.forEach((noteId, index) => {
      const userId = lockHolders[index];
      if (!userId) return;
      noteLocks[noteId] = {
        userId,
        username: membersByUserId.get(userId)?.username ?? 'Online',
      };
    });
    const activeUsers: ActiveUserState[] = presence.map((active) => {
      const member = membersByUserId.get(active.userId);
      return {
        userId: active.userId,
        username: member?.username ?? 'Online',
        avatarColor: member?.avatarColor ?? '#64748b',
        cursorX: active.cursorX,
        cursorY: active.cursorY,
        currentNoteId: active.currentNoteId,
        isTyping: active.isTyping,
      };
    });

    return {
      notes: plainToInstance(NoteResponseDto, notes, {
        excludeExtraneousValues: true,
      }),
      members,
      activeUsers,
      noteLocks,
    };
  }

  private async upsertPresence(
    boardId: string,
    userId: string,
    socketId: string,
  ): Promise<void> {
    const key = this.presenceKey(boardId);
    const current = await this.readPresence(key, userId);
    const presence: RedisPresence = {
      cursorX: null,
      cursorY: null,
      currentNoteId: null,
      isTyping: false,
      ...current,
      socketId,
      lastHeartbeat: Date.now(),
    };
    await this.redis.client.hSet(key, userId, JSON.stringify(presence));
  }

  private async updatePresence(
    boardId: string,
    userId: string,
    socketId: string,
    patch: Partial<
      Pick<RedisPresence, 'cursorX' | 'cursorY' | 'currentNoteId' | 'isTyping'>
    >,
  ): Promise<void> {
    const key = this.presenceKey(boardId);
    const current = await this.readPresence(key, userId);
    if (!current || current.socketId !== socketId) return;

    const presence: RedisPresence = {
      ...current,
      ...patch,
      socketId,
      lastHeartbeat: Date.now(),
    };
    await this.redis.client.hSet(key, userId, JSON.stringify(presence));
  }

  private async readPresence(
    key: string,
    userId: string,
  ): Promise<RedisPresence | null> {
    const value = await this.redis.client.hGet(key, userId);
    return value ? this.parsePresence(value) : null;
  }

  private parsePresence(value: string): RedisPresence | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
    if (!this.isRecord(parsed)) return null;

    const {
      socketId,
      cursorX,
      cursorY,
      currentNoteId,
      isTyping,
      lastHeartbeat,
    } = parsed;
    if (
      typeof socketId !== 'string' ||
      !this.isNullableNumber(cursorX) ||
      !this.isNullableNumber(cursorY) ||
      !this.isNullableString(currentNoteId) ||
      typeof isTyping !== 'boolean' ||
      typeof lastHeartbeat !== 'number' ||
      !Number.isFinite(lastHeartbeat)
    ) {
      return null;
    }

    return {
      socketId,
      cursorX,
      cursorY,
      currentNoteId,
      isTyping,
      lastHeartbeat,
    };
  }

  private presenceKey(boardId: string): string {
    return `board:${boardId}:presence`;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isNullableNumber(value: unknown): value is number | null {
    return (
      value === null || (typeof value === 'number' && Number.isFinite(value))
    );
  }

  private isNullableString(value: unknown): value is string | null {
    return value === null || typeof value === 'string';
  }
}
