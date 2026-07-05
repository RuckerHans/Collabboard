import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { Server, ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private readonly pubClient: ReturnType<typeof createClient>;
  private readonly subClient: ReturnType<typeof createClient>;
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(app: ConstructorParameters<typeof IoAdapter>[0]) {
    super(app);
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.pubClient = createClient({ url });
    this.subClient = this.pubClient.duplicate();

    this.pubClient.on('error', (error: unknown) => {
      this.logger.error(this.errorMessage('publisher', error));
    });
    this.subClient.on('error', (error: unknown) => {
      this.logger.error(this.errorMessage('subscriber', error));
    });
  }

  async connect(): Promise<void> {
    try {
      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
      this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    } catch (error) {
      await this.closeRedisClients();
      throw error;
    }
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    if (!this.adapterConstructor) {
      throw new Error('RedisIoAdapter.connect() must complete before use');
    }

    const server = super.createIOServer(port, options) as Server;
    server.adapter(this.adapterConstructor);
    return server;
  }

  async dispose(): Promise<void> {
    await this.closeRedisClients();
    await super.dispose();
  }

  private async closeRedisClients(): Promise<void> {
    await Promise.all(
      [this.pubClient, this.subClient].map(async (client) => {
        if (client.isOpen) await client.quit();
      }),
    );
  }

  private errorMessage(connection: string, error: unknown): string {
    const message =
      error instanceof Error ? error.message : 'Unknown Redis error';
    return `Socket.IO Redis ${connection} error: ${message}`;
  }
}
