import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NoteHistory } from '../notes/note-history.entity';
import { Note } from '../notes/note.entity';
import { ActiveBoardUser } from '../presence/active-board-user.entity';
import { User } from '../users/user.entity';
import { BoardMember } from './board-member.entity';

@Entity('boards')
export class Board {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ name: 'owner_id' })
  ownerId!: string;

  @Column({ name: 'is_archived', default: false })
  isArchived!: boolean;

  @ManyToOne(() => User, (user) => user.ownedBoards)
  @JoinColumn({ name: 'owner_id' })
  owner!: User;

  @OneToMany(() => BoardMember, (member) => member.board)
  members!: BoardMember[];

  @OneToMany(() => Note, (note) => note.board)
  notes!: Note[];

  @OneToMany(() => NoteHistory, (history) => history.board)
  noteHistory!: NoteHistory[];

  @OneToMany(() => ActiveBoardUser, (active) => active.board)
  activeUsers!: ActiveBoardUser[];
}
