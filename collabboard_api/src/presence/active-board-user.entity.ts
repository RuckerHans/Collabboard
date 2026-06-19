import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Board } from '../boards/board.entity';
import { Note } from '../notes/note.entity';
import { User } from '../users/user.entity';

@Entity('active_board_users')
export class ActiveBoardUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'board_id' })
  boardId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'socket_id' })
  socketId: string;

  @Column({ name: 'last_heartbeat', type: 'timestamptz' })
  lastHeartbeat: Date;

  @Column({ name: 'cursor_x', type: 'float', nullable: true })
  cursorX?: number;

  @Column({ name: 'cursor_y', type: 'float', nullable: true })
  cursorY?: number;

  @Column({ name: 'current_note_id', nullable: true })
  currentNoteId?: string | null;

  @Column({ name: 'is_typing', default: false })
  isTyping: boolean;

  @Column({ name: 'typing_expires_at', type: 'timestamptz', nullable: true })
  typingExpiresAt?: Date | null;

  @ManyToOne(() => Board, (board) => board.activeUsers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'board_id' })
  board: Board;

  @ManyToOne(() => User, (user) => user.activeBoards)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Note, (note) => note.activeUsers, { nullable: true })
  @JoinColumn({ name: 'current_note_id' })
  currentNote?: Note;
}
