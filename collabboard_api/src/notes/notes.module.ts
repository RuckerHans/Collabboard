import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoardsModule } from '../boards/boards.module';
import { NoteHistoryQueueService } from './note-history-queue.service';
import { NoteHistory } from './note-history.entity';
import { NoteLockService } from './note-lock.service';
import { Note } from './note.entity';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Note, NoteHistory]), BoardsModule],
  controllers: [NotesController],
  providers: [NotesService, NoteLockService, NoteHistoryQueueService],
  exports: [NotesService, NoteLockService],
})
export class NotesModule {}
