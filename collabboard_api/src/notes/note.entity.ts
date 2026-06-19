import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Board } from '../boards/board.entity';
import { ActiveBoardUser } from '../presence/active-board-user.entity';
import { User } from '../users/user.entity';
import { NoteHistory } from './note-history.entity';

@Entity('notes')
export class Note {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'board_id' })
  boardId: string;

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column({ nullable: true })
  title?: string;

  @Column({ nullable: true })
  content?: string;

  @Column({ nullable: true })
  color?: string;

  @Column({ name: 'position_x', type: 'float', default: 0 })
  positionX: number;

  @Column({ name: 'position_y', type: 'float', default: 0 })
  positionY: number;

  @Column({ type: 'float', default: 280 })
  width: number;

  @Column({ type: 'float', default: 180 })
  height: number;

  @Column({ name: 'z_index', type: 'int', default: 0 })
  zIndex: number;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ name: 'is_pinned', default: false })
  isPinned: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;

  @ManyToOne(() => Board, (board) => board.notes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'board_id' })
  board: Board;

  @ManyToOne(() => User, (user) => user.notes)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @OneToMany(() => NoteHistory, (history) => history.note)
  history: NoteHistory[];

  @OneToMany(() => ActiveBoardUser, (active) => active.currentNote)
  activeUsers: ActiveBoardUser[];
}
