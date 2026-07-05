import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoardsModule } from '../boards/boards.module';
import { NoteHistory } from './note-history.entity';
import { NoteLockService } from './note-lock.service';
import { Note } from './note.entity';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Note, NoteHistory]), BoardsModule],
  controllers: [NotesController],
  providers: [NotesService, NoteLockService],
  exports: [NotesService, NoteLockService],
})
export class NotesModule {}
