import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Board } from './board.entity';

export type BoardRole = 'owner' | 'editor' | 'viewer';

@Entity('board_members')
export class BoardMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'board_id' })
  boardId!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar' })
  role!: BoardRole;

  @Column({ name: 'invited_by', nullable: true })
  invitedBy?: string | null;

  @ManyToOne(() => Board, (board) => board.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'board_id' })
  board!: Board;

  @ManyToOne(() => User, (user) => user.memberships)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'invited_by' })
  invitedByUser?: User;
}
