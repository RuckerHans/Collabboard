import { Exclude } from 'class-transformer';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { BoardMember } from '../boards/board-member.entity';
import { Board } from '../boards/board.entity';
import { NoteHistory } from '../notes/note-history.entity';
import { Note } from '../notes/note.entity';
import { ActiveBoardUser } from '../presence/active-board-user.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  username!: string;

  @Column({ unique: true })
  email!: string;

  @Exclude()
  @Column({ name: 'password_hash', nullable: true })
  passwordHash?: string;

  @Column({ name: 'oauth_provider', nullable: true })
  oauthProvider?: string;

  @Column({ name: 'oauth_id', nullable: true })
  oauthId?: string;

  @Column({ name: 'avatar_color', default: '#4f46e5' })
  avatarColor!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @OneToMany(() => Board, (board) => board.owner)
  ownedBoards!: Board[];

  @OneToMany(() => BoardMember, (member) => member.user)
  memberships!: BoardMember[];

  @OneToMany(() => Note, (note) => note.creator)
  notes!: Note[];

  @OneToMany(() => NoteHistory, (history) => history.changedByUser)
  noteHistory!: NoteHistory[];

  @OneToMany(() => ActiveBoardUser, (active) => active.user)
  activeBoards!: ActiveBoardUser[];
}
