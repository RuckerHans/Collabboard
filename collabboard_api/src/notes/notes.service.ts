import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { IsNull } from 'typeorm';
import { BoardsService } from '../boards/boards.service';
import { DatabaseService } from '../database/database.service';
import {
  CreateNoteDto,
  NoteHistoryResponseDto,
  NoteResponseDto,
  UpdateNoteDto,
  UpdateNotePositionDto,
} from './dto/note.dto';
import { NoteHistory } from './note-history.entity';
import { Note } from './note.entity';

type ConflictBody = {
  error: 'conflict';
  current_version: number;
  current_note: NoteResponseDto;
};

@Injectable()
export class NotesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly boards: BoardsService,
  ) {}

  async listActive(boardId: string, userId: string) {
    await this.boards.assertMember(boardId, userId);
    const notes = await this.db.manager.find(Note, {
      where: { boardId, deletedAt: IsNull() },
      order: { zIndex: 'ASC' },
    });
    return plainToInstance(NoteResponseDto, notes, {
      excludeExtraneousValues: true,
    });
  }

  async create(boardId: string, dto: CreateNoteDto, userId: string) {
    await this.boards.assertRole(boardId, userId, ['owner', 'editor']);
    const note = this.db.manager.create(Note, {
      boardId,
      createdBy: userId,
      title: dto.title,
      content: dto.content,
      color: dto.color ?? '#fef3c7',
      positionX: this.clampPosition(dto.positionX ?? 0),
      positionY: this.clampPosition(dto.positionY ?? 0),
      width: dto.width ?? 280,
      height: dto.height ?? 180,
      zIndex: Math.max(0, dto.zIndex ?? 0),
      isPinned: dto.isPinned ?? false,
      version: 1,
    });
    return this.serialize(await this.db.manager.save(Note, note));
  }

  async update(
    boardId: string,
    id: string,
    dto: UpdateNoteDto,
    userId: string,
  ) {
    await this.boards.assertRole(boardId, userId, ['owner', 'editor']);
    const patch = this.cleanPatch({
      title: dto.title,
      content: dto.content,
      color: dto.color,
      width: dto.width,
      height: dto.height,
      isPinned: dto.isPinned,
    });
    return this.optimisticUpdate(boardId, id, dto.current_version, patch);
  }

  async updatePosition(
    boardId: string,
    id: string,
    dto: UpdateNotePositionDto,
    userId: string,
  ) {
    await this.boards.assertRole(boardId, userId, ['owner', 'editor']);
    return this.optimisticUpdate(boardId, id, dto.current_version, {
      positionX: this.clampPosition(dto.positionX),
      positionY: this.clampPosition(dto.positionY),
      zIndex: Math.max(0, dto.zIndex),
    });
  }

  async softDelete(boardId: string, id: string, userId: string) {
    await this.boards.assertRole(boardId, userId, ['owner', 'editor']);
    const result = await this.db.manager.update(
      Note,
      { boardId, id, deletedAt: IsNull() },
      { deletedAt: new Date() },
    );
    if (!result.affected) throw new NotFoundException('Note not found');
    return { deleted: true };
  }

  async restore(boardId: string, id: string, userId: string) {
    await this.boards.assertRole(boardId, userId, ['owner', 'editor']);
    const result = await this.db.manager.update(
      Note,
      { boardId, id },
      { deletedAt: null },
    );
    if (!result.affected) throw new NotFoundException('Note not found');
    return this.getCurrent(boardId, id);
  }

  async history(boardId: string, id: string, userId: string) {
    await this.boards.assertMember(boardId, userId);
    const rows = await this.db.manager.find(NoteHistory, {
      where: { boardId, noteId: id },
      order: { versionAfter: 'DESC' },
    });
    return plainToInstance(NoteHistoryResponseDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  async updateFromSocket(
    boardId: string,
    id: string,
    currentVersion: number,
    fields: Record<string, unknown>,
    userId: string,
  ) {
    return this.db.runInRlsTransaction(userId, async () => {
      await this.boards.assertRole(boardId, userId, ['owner', 'editor']);
      return this.optimisticUpdate(
        boardId,
        id,
        currentVersion,
        this.cleanPatch(fields),
      );
    });
  }

  private async optimisticUpdate(
    boardId: string,
    id: string,
    currentVersion: number,
    patch: Partial<Note>,
  ) {
    const result = await this.db.manager
      .createQueryBuilder()
      .update(Note)
      .set({ ...patch, version: () => 'version + 1' })
      .where('id = :id', { id })
      .andWhere('board_id = :boardId', { boardId })
      .andWhere('version = :currentVersion', { currentVersion })
      .andWhere('deleted_at IS NULL')
      .execute();

    if (!result.affected) {
      const current = await this.getCurrent(boardId, id);
      throw new ConflictException({
        error: 'conflict',
        current_version: current.version,
        current_note: current,
      } satisfies ConflictBody);
    }

    return this.getCurrent(boardId, id);
  }

  private async getCurrent(boardId: string, id: string) {
    const note = await this.db.manager.findOne(Note, {
      where: { boardId, id },
    });
    if (!note) throw new NotFoundException('Note not found');
    return this.serialize(note);
  }

  private serialize(note: Note) {
    return plainToInstance(NoteResponseDto, note, {
      excludeExtraneousValues: true,
    });
  }

  private clampPosition(value: number) {
    return Math.max(0, Math.round(value));
  }

  private cleanPatch<T extends Record<string, unknown>>(
    patch: T,
  ): Partial<Note> {
    const editableFields = new Set([
      'title',
      'content',
      'color',
      'positionX',
      'positionY',
      'width',
      'height',
      'zIndex',
      'isPinned',
    ]);
    return Object.fromEntries(
      Object.entries(patch).filter(
        ([key, value]) => editableFields.has(key) && value !== undefined,
      ),
    ) as Partial<Note>;
  }
}

