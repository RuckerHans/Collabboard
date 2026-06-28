import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { UsersService } from '../users/users.service';
import { BoardMember, BoardRole } from './board-member.entity';
import { Board } from './board.entity';
import {
  BoardMemberResponseDto,
  BoardResponseDto,
  CreateBoardDto,
  InviteMemberDto,
  UpdateBoardDto,
} from './dto/board.dto';

@Injectable()
export class BoardsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly users: UsersService,
  ) {}

  async listForUser(userId: string) {
    const rows = await this.db.manager
      .createQueryBuilder(Board, 'board')
      .innerJoin(
        BoardMember,
        'member',
        'member.board_id = board.id AND member.user_id = :userId',
        { userId },
      )
      .leftJoin(BoardMember, 'all_members', 'all_members.board_id = board.id')
      .where('board.is_archived = false')
      .groupBy('board.id')
      .select([
        'board.id AS id',
        'board.name AS name',
        'board.description AS description',
        'board.owner_id AS "ownerId"',
        'board.is_archived AS "isArchived"',
        'COUNT(all_members.id)::int AS "memberCount"',
        'NULL::text AS "lastActivity"',
      ])
      .getRawMany();
    return plainToInstance(BoardResponseDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  async create(dto: CreateBoardDto, ownerId: string) {
    const boardId = randomUUID();
    const membershipId = randomUUID();

    // Do not use INSERT ... RETURNING here. On databases with the original RLS
    // policy, the board is not selectable until this membership exists, while
    // the membership cannot exist before the board. Both inserts remain atomic
    // because every authenticated HTTP request runs in one RLS transaction.
    await this.db.manager.query(
      `INSERT INTO boards (id, name, description, owner_id, is_archived)
       VALUES ($1, $2, $3, $4, false)`,
      [boardId, dto.name, dto.description ?? null, ownerId],
    );
    await this.db.manager.query(
      `INSERT INTO board_members
         (id, board_id, user_id, role, invited_by)
       VALUES ($1, $2, $3, 'owner', NULL)`,
      [membershipId, boardId, ownerId],
    );

    return plainToInstance(
      BoardResponseDto,
      {
        id: boardId,
        name: dto.name,
        description: dto.description,
        ownerId,
        isArchived: false,
        memberCount: 1,
      },
      { excludeExtraneousValues: true },
    );
  }

  async getWithMembers(boardId: string, userId: string) {
    await this.assertMember(boardId, userId);
    const board = await this.db.manager.findOne(Board, {
      where: { id: boardId, isArchived: false },
    });
    if (!board) throw new NotFoundException('Board not found');
    const members = await this.db.manager
      .createQueryBuilder(BoardMember, 'member')
      .innerJoin('member.user', 'user')
      .where('member.board_id = :boardId', { boardId })
      .select([
        'member.id AS id',
        'member.user_id AS "userId"',
        'member.role AS role',
        'user.username AS username',
        'user.email AS email',
        'user.avatar_color AS "avatarColor"',
      ])
      .getRawMany();
    return plainToInstance(
      BoardResponseDto,
      {
        ...board,
        members: plainToInstance(BoardMemberResponseDto, members, {
          excludeExtraneousValues: true,
        }),
      },
      { excludeExtraneousValues: true },
    );
  }

  async update(boardId: string, dto: UpdateBoardDto, userId: string) {
    await this.assertRole(boardId, userId, ['owner', 'editor']);
    await this.db.manager.update(Board, { id: boardId }, dto);
    return this.getWithMembers(boardId, userId);
  }

  async remove(boardId: string, userId: string) {
    await this.assertRole(boardId, userId, ['owner']);
    await this.db.manager.delete(Board, { id: boardId });
    return { deleted: true };
  }

  async inviteMember(boardId: string, dto: InviteMemberDto, invitedBy: string) {
    await this.assertRole(boardId, invitedBy, ['owner']);
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new NotFoundException('Invitee not found');
    const member = this.db.manager.create(BoardMember, {
      boardId,
      userId: user.id,
      role: dto.role,
      invitedBy,
    });
    return plainToInstance(
      BoardMemberResponseDto,
      await this.db.manager.save(BoardMember, member),
      {
        excludeExtraneousValues: true,
      },
    );
  }

  async changeMemberRole(
    boardId: string,
    userId: string,
    role: BoardRole,
    actorId: string,
  ) {
    await this.assertRole(boardId, actorId, ['owner']);
    await this.db.manager.update(BoardMember, { boardId, userId }, { role });
    return this.getWithMembers(boardId, actorId);
  }

  async removeMember(boardId: string, userId: string, actorId: string) {
    if (userId !== actorId) {
      await this.assertRole(boardId, actorId, ['owner']);
    }
    await this.db.manager.delete(BoardMember, { boardId, userId });
    return { removed: true };
  }

  async assertMember(boardId: string, userId: string): Promise<BoardMember> {
    const member = await this.db.manager.findOne(BoardMember, {
      where: { boardId, userId },
    });
    if (!member) throw new ForbiddenException('Board membership required');
    return member;
  }

  async assertRole(boardId: string, userId: string, roles: BoardRole[]) {
    const member = await this.assertMember(boardId, userId);
    if (!roles.includes(member.role)) {
      throw new ForbiddenException('Insufficient board role');
    }
    return member;
  }
}
