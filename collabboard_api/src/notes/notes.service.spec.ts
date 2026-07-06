import { ConflictException } from '@nestjs/common';
import { BoardsService } from '../boards/boards.service';
import { DatabaseService } from '../database/database.service';
import { NoteHistoryQueueService } from './note-history-queue.service';
import { NoteLockService } from './note-lock.service';
import { NotesService } from './notes.service';

describe('NotesService socket locking', () => {
  it('rejects a socket update when another user holds the note lock', async () => {
    const db = {
      runInRlsTransaction: jest.fn(
        async (_userId: string, work: () => Promise<unknown>) => work(),
      ),
    };
    const boards = {
      assertRole: jest.fn().mockResolvedValue({}),
    };
    const noteLocks = {
      holder: jest.fn().mockResolvedValue('user-2'),
    };
    const noteHistoryQueue = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const service = new NotesService(
      db as unknown as DatabaseService,
      boards as unknown as BoardsService,
      noteLocks as unknown as NoteLockService,
      noteHistoryQueue as unknown as NoteHistoryQueueService,
    );

    let caught: unknown;
    try {
      await service.updateFromSocket(
        'board-1',
        'note-1',
        1,
        { title: 'Blocked edit' },
        'user-1',
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toEqual({
      error: 'locked',
      heldBy: 'user-2',
    });
  });
});
