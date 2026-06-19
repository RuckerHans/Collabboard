import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Client, Notification } from 'pg';

export type BoardNotification = {
  channel: 'board_events' | 'presence_events';
  payload: Record<string, unknown>;
};

@Injectable()
export class PgNotifyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgNotifyService.name);
  private client?: Client;

  constructor(
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  async onModuleInit() {
    this.client = new Client({
      connectionString: this.config.get<string>('DATABASE_URL'),
      host: this.config.get<string>('DB_HOST'),
      port: this.config.get<number>('DB_PORT') ?? 5432,
      user: this.config.get<string>('DB_USERNAME'),
      password: this.config.get<string>('DB_PASSWORD'),
      database: this.config.get<string>('DB_NAME'),
      ssl:
        this.config.get<string>('DB_SSL') === 'true'
          ? { rejectUnauthorized: false }
          : undefined,
    });

    this.client.on('notification', (notification) =>
      this.handleNotification(notification),
    );
    this.client.on('error', (error) =>
      this.logger.error(error.message, error.stack),
    );
    await this.client.connect();
    await this.client.query('LISTEN board_events');
    await this.client.query('LISTEN presence_events');
    this.logger.log('Listening on board_events and presence_events');
  }

  async onModuleDestroy() {
    await this.client?.end();
  }

  private handleNotification(notification: Notification) {
    if (
      notification.channel !== 'board_events' &&
      notification.channel !== 'presence_events'
    ) {
      return;
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = notification.payload ? JSON.parse(notification.payload) : {};
    } catch {
      payload = { raw: notification.payload };
    }

    const event: BoardNotification = { channel: notification.channel, payload };
    this.events.emit('pg.notify', event);
    this.events.emit(`pg.${notification.channel}`, event);
  }
}
