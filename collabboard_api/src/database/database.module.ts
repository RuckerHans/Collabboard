import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoardMember } from '../boards/board-member.entity';
import { Board } from '../boards/board.entity';
import { NoteHistory } from '../notes/note-history.entity';
import { Note } from '../notes/note.entity';
import { ActiveBoardUser } from '../presence/active-board-user.entity';
import { User } from '../users/user.entity';
import { DatabaseService } from './database.service';
import { PgNotifyService } from './pg-notify.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT') ?? 5432,
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        ssl:
          config.get<string>('DB_SSL') === 'true'
            ? { rejectUnauthorized: false }
            : false,
        entities: [
          User,
          Board,
          BoardMember,
          Note,
          NoteHistory,
          ActiveBoardUser,
        ],
        synchronize: false,
        logging:
          config.get<string>('NODE_ENV') === 'development'
            ? ['error', 'warn']
            : ['error'],
      }),
    }),
  ],
  providers: [DatabaseService, PgNotifyService],
  exports: [TypeOrmModule, DatabaseService, PgNotifyService],
})
export class DatabaseModule {}
