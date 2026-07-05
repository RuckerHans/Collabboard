import { RedisService } from '../database/redis.service';
import { NoteLockService } from './note-lock.service';

describe('NoteLockService', () => {
  let redisClient: {
    set: jest.Mock;
    eval: jest.Mock;
    get: jest.Mock;
    scanIterator: jest.Mock;
  };
  let service: NoteLockService;

  beforeEach(() => {
    redisClient = {
      set: jest.fn(),
      eval: jest.fn(),
      get: jest.fn(),
      scanIterator: jest.fn(),
    };
    service = new NoteLockService({
      client: redisClient,
    } as unknown as RedisService);
  });

  it('acquires a lock with NX and an eight-second TTL', async () => {
    redisClient.set.mockResolvedValue('OK');

    await expect(service.acquire('note-1', 'user-1')).resolves.toBe(true);
    expect(redisClient.set).toHaveBeenCalledWith('note:note-1:lock', 'user-1', {
      NX: true,
      EX: 8,
    });
  });

  it('returns false when the lock is already held', async () => {
    redisClient.set.mockResolvedValue(null);

    await expect(service.acquire('note-1', 'user-1')).resolves.toBe(false);
  });

  it('renews and releases through atomic holder-check scripts', async () => {
    redisClient.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(service.renew('note-1', 'user-1')).resolves.toBe(true);
    await expect(service.release('note-1', 'user-2')).resolves.toBe(false);

    expect(redisClient.eval).toHaveBeenNthCalledWith(1, expect.any(String), {
      keys: ['note:note-1:lock'],
      arguments: ['user-1', '8'],
    });
    expect(redisClient.eval).toHaveBeenNthCalledWith(2, expect.any(String), {
      keys: ['note:note-1:lock'],
      arguments: ['user-2'],
    });
  });

  it('uses SCAN and returns only locks released for the user', async () => {
    redisClient.scanIterator.mockImplementation(async function* () {
      yield ['note:note-1:lock', 'note:note-2:lock'];
    });
    redisClient.eval.mockImplementation(
      async (
        _script: string,
        options: { keys: string[]; arguments: string[] },
      ) => Number(options.keys[0] === 'note:note-1:lock'),
    );

    await expect(service.releaseAll('user-1')).resolves.toEqual(['note-1']);
    expect(redisClient.scanIterator).toHaveBeenCalledWith({
      MATCH: 'note:*:lock',
      COUNT: 100,
    });
  });

  it('returns the current lock holder', async () => {
    redisClient.get.mockResolvedValue('user-1');

    await expect(service.holder('note-1')).resolves.toBe('user-1');
    expect(redisClient.get).toHaveBeenCalledWith('note:note-1:lock');
  });
});
