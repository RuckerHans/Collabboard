import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { BoardsModule } from '../boards/boards.module';
import { NotesModule } from '../notes/notes.module';
import { UsersModule } from '../users/users.module';
import { ActiveBoardUser } from './active-board-user.entity';
import { PresenceGateway } from './presence.gateway';
import { PresenceService } from './presence.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActiveBoardUser]),
    AuthModule,
    BoardsModule,
    NotesModule,
    UsersModule,
  ],
  providers: [PresenceGateway, PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
