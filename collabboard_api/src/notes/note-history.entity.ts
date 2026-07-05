import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Board } from '../boards/board.entity';
import { User } from '../users/user.entity';
import { Note } from './note.entity';

@Entity('note_history')
export class NoteHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'note_id' })
  noteId!: string;

  @Column({ name: 'board_id' })
  boardId!: string;

  @Column({ name: 'changed_by' })
  changedBy!: string;

  @Column()
  operation!: string;

  @Column({ name: 'version_before', type: 'int', nullable: true })
  versionBefore?: number;

  @Column({ name: 'version_after', type: 'int', nullable: true })
  versionAfter?: number;

  @Column({ name: 'before_snapshot', type: 'jsonb', nullable: true })
  beforeSnapshot?: Record<string, unknown>;

  @Column({ name: 'after_snapshot', type: 'jsonb', nullable: true })
  afterSnapshot?: Record<string, unknown>;

  @Column({ name: 'changed_fields', type: 'text', array: true, nullable: true })
  changedFields?: string[];

  @ManyToOne(() => Note, (note) => note.history, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'note_id' })
  note!: Note;

  @ManyToOne(() => Board, (board) => board.noteHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'board_id' })
  board!: Board;

  @ManyToOne(() => User, (user) => user.noteHistory)
  @JoinColumn({ name: 'changed_by' })
  changedByUser!: User;
}
