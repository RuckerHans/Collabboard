import { Injectable } from '@nestjs/common';
import { RedisService } from '../database/redis.service';

const LOCK_TTL_SECONDS = 8;
const LOCK_PATTERN = 'note:*:lock';

const RENEW_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('EXPIRE', KEYS[1], ARGV[2])
  end
  return 0
`;

const RELEASE_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

@Injectable()
export class NoteLockService {
  constructor(private readonly redis: RedisService) {}

  async acquire(noteId: string, userId: string): Promise<boolean> {
    const result = await this.redis.client.set(this.lockKey(noteId), userId, {
      NX: true,
      EX: LOCK_TTL_SECONDS,
    });
    return result === 'OK';
  }

  async renew(noteId: string, userId: string): Promise<boolean> {
    const result = await this.redis.client.eval(RENEW_SCRIPT, {
      keys: [this.lockKey(noteId)],
      arguments: [userId, String(LOCK_TTL_SECONDS)],
    });
    return result === 1;
  }

  async release(noteId: string, userId: string): Promise<boolean> {
    const result = await this.redis.client.eval(RELEASE_SCRIPT, {
      keys: [this.lockKey(noteId)],
      arguments: [userId],
    });
    return result === 1;
  }

  async releaseAll(userId: string): Promise<string[]> {
    const released = new Set<string>();

    for await (const keys of this.redis.client.scanIterator({
      MATCH: LOCK_PATTERN,
      COUNT: 100,
    })) {
      for (const key of keys) {
        const noteId = this.noteIdFromKey(key);
        if (noteId && (await this.release(noteId, userId))) {
          released.add(noteId);
        }
      }
    }

    return [...released];
  }

  async holder(noteId: string): Promise<string | null> {
    return this.redis.client.get(this.lockKey(noteId));
  }

  private lockKey(noteId: string): string {
    return `note:${noteId}:lock`;
  }

  private noteIdFromKey(key: string): string | null {
    const prefix = 'note:';
    const suffix = ':lock';
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) return null;
    const noteId = key.slice(prefix.length, -suffix.length);
    return noteId.length > 0 ? noteId : null;
  }
}
