import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';
import { DatabaseModule } from './database/database.module';
import { RlsTransactionInterceptor } from './database/rls-transaction.interceptor';
import { NotesModule } from './notes/notes.module';
import { PresenceModule } from './presence/presence.module';
import { UsersModule } from './users/users.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        // Default limit for every route that doesn't set its own @Throttle().
        // Generous enough for normal app usage, low enough to blunt scripted abuse.
        name: 'default',
        ttl: 60_000,
        limit: 20,
      },
    ]),
    DatabaseModule,
    UsersModule,
    AuthModule,
    BoardsModule,
    NotesModule,
    PresenceModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RlsTransactionInterceptor },
  ],
})
export class AppModule {}
