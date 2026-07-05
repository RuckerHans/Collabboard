import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: ReturnType<typeof createClient>;
  private connection: Promise<void> | undefined;

  constructor(config: ConfigService) {
    this.client = createClient({
      url: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
    });
    this.client.on('error', (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unknown Redis error';
      console.error('Redis error:', message);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureConnected();
  }

  async ensureConnected(): Promise<void> {
    if (this.client.isOpen) return;
    this.connection ??= this.client.connect().then(() => undefined);
    await this.connection;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}
