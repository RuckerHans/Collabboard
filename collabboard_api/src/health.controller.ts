import { Controller, Get } from '@nestjs/common';
import { RedisService } from './database/redis.service';

@Controller('health')
export class HealthController {
  constructor(private readonly redis: RedisService) {}

  @Get()
  async check(): Promise<{ status: 'ok'; redis: 'ok' }> {
    await this.redis.ensureConnected();
    await this.redis.client.ping();
    return { status: 'ok', redis: 'ok' };
  }
}
