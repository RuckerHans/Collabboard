import { BoardsService } from '../boards/boards.service';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../database/redis.service';
import { PresenceService } from './presence.service';

describe('PresenceService', () => {
  const boardId = 'board-1';
  const userId = 'user-1';
  const key = `board:${boardId}:presence`;
  let hashes: Map<string, Map<string, string>>;
  let redisClient: {
    hGet: jest.Mock;
    hSet: jest.Mock;
    hGetAll: jest.Mock;
    hDel: jest.Mock;
    mGet: jest.Mock;
  };
  let boards: { assertMember: jest.Mock };
  let findNotes: jest.Mock;
  let getMembers: jest.Mock;
  let service: PresenceService;

  beforeEach(() => {
    hashes = new Map();
    redisClient = {
      hGet: jest.fn(async (hashKey: string, field: string) => {
        return hashes.get(hashKey)?.get(field) ?? null;
      }),
      hSet: jest.fn(async (hashKey: string, field: string, value: string) => {
        const hash = hashes.get(hashKey) ?? new Map<string, string>();
        hash.set(field, value);
        hashes.set(hashKey, hash);
        return 1;
      }),
      hGetAll: jest.fn(async (hashKey: string) => {
        return Object.fromEntries(hashes.get(hashKey) ?? []);
      }),
      hDel: jest.fn(async (hashKey: string, fields: string | string[]) => {
        const hash = hashes.get(hashKey);
        if (!hash) return 0;
        const fieldList = Array.isArray(fields) ? fields : [fields];
        return fieldList.reduce(
          (removed, field) => removed + Number(hash.delete(field)),
          0,
        );
      }),
      mGet: jest.fn().mockResolvedValue([]),
    };
    boards = { assertMember: jest.fn().mockResolvedValue({}) };
    findNotes = jest.fn().mockResolvedValue([]);
    getMembers = jest.fn().mockResolvedValue([]);

    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawMany: getMembers,
    };
    const db = {
      runInRlsTransaction: jest.fn(
        async (_scopedUserId: string, work: () => Promise<unknown>) => work(),
      ),
      manager: {
        find: findNotes,
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      },
    };

    service = new PresenceService(
      db as unknown as DatabaseService,
      boards as unknown as BoardsService,
      { client: redisClient } as unknown as RedisService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('checks membership before writing the expected Redis presence record', async () => {
    const order: string[] = [];
    boards.assertMember.mockImplementation(async () => {
      order.push('membership');
      return {};
    });
    redisClient.hSet.mockImplementation(
      async (hashKey: string, field: string, value: string) => {
        order.push('redis');
        const hash = hashes.get(hashKey) ?? new Map<string, string>();
        hash.set(field, value);
        hashes.set(hashKey, hash);
        return 1;
      },
    );
    jest.spyOn(Date, 'now').mockReturnValue(1_000);

    await service.joinBoard(boardId, userId, 'socket-1');

    expect(order.slice(0, 2)).toEqual(['membership', 'redis']);
    expect(JSON.parse(hashes.get(key)!.get(userId)!)).toEqual({
      socketId: 'socket-1',
      cursorX: null,
      cursorY: null,
      currentNoteId: null,
      isTyping: false,
      lastHeartbeat: 1_000,
    });
  });

  it('does not write Redis presence when the membership check fails', async () => {
    boards.assertMember.mockRejectedValue(
      new Error('Board membership required'),
    );

    await expect(
      service.joinBoard(boardId, userId, 'socket-1'),
    ).rejects.toThrow('Board membership required');

    expect(redisClient.hSet).not.toHaveBeenCalled();
  });

  it('includes a board-scoped note lock snapshot in board state', async () => {
    findNotes.mockResolvedValue([{ id: 'note-1' }, { id: 'note-2' }]);
    getMembers.mockResolvedValue([
      { userId: 'holder-1', username: 'Lock Holder' },
    ]);
    redisClient.mGet.mockResolvedValue(['holder-1', null]);

    const state = await service.boardState(boardId, userId);

    expect(redisClient.mGet).toHaveBeenCalledWith([
      'note:note-1:lock',
      'note:note-2:lock',
    ]);
    expect(state.noteLocks).toEqual({
      'note-1': { userId: 'holder-1', username: 'Lock Holder' },
    });
  });

  it('filters and removes presence older than sixty seconds', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(100_000);
    hashes.set(
      key,
      new Map([
        [
          'active-user',
          JSON.stringify({
            socketId: 'socket-active',
            cursorX: 10,
            cursorY: 20,
            currentNoteId: null,
            isTyping: false,
            lastHeartbeat: 40_000,
          }),
        ],
        [
          'stale-user',
          JSON.stringify({
            socketId: 'socket-stale',
            cursorX: null,
            cursorY: null,
            currentNoteId: null,
            isTyping: false,
            lastHeartbeat: 39_999,
          }),
        ],
      ]),
    );

    const active = await service.activeUsers(boardId);

    expect(active.map((presence) => presence.userId)).toEqual(['active-user']);
    expect(redisClient.hDel).toHaveBeenCalledWith(key, ['stale-user']);
  });

  it('ignores updates and disconnects from a superseded socket', async () => {
    hashes.set(
      key,
      new Map([
        [
          userId,
          JSON.stringify({
            socketId: 'socket-new',
            cursorX: null,
            cursorY: null,
            currentNoteId: null,
            isTyping: false,
            lastHeartbeat: 1_000,
          }),
        ],
      ]),
    );

    await service.heartbeat(boardId, userId, 'socket-old', 12, 34);
    await service.leaveBoard(boardId, userId, 'socket-old');

    expect(redisClient.hSet).not.toHaveBeenCalled();
    expect(redisClient.hDel).not.toHaveBeenCalled();
    expect(hashes.get(key)?.has(userId)).toBe(true);
  });

  it('forcibly removes a user when board membership is revoked', async () => {
    hashes.set(key, new Map([[userId, '{}']]));

    await service.removeUser(boardId, userId);

    expect(redisClient.hDel).toHaveBeenCalledWith(key, userId);
    expect(hashes.get(key)?.has(userId)).toBe(false);
  });
});
