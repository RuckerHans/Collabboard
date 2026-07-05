import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { User } from './user.entity';

type AuthUserRow = {
  id: string;
  email: string;
  username: string;
  password_hash?: string;
  avatar_color: string;
  is_active: boolean;
};

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<User | null> {
    const rows = await this.db.manager.query<AuthUserRow[]>(
      'SELECT * FROM find_user_by_id_for_auth($1)',
      [id],
    );
    return rows.length === 0 ? null : this.authRowToUser(rows[0]);
  }

  async getById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db.manager.query<AuthUserRow[]>(
      'SELECT * FROM find_user_for_auth($1)',
      [email.toLowerCase()],
    );
    if (rows.length === 0) {
      return null;
    }
    return this.authRowToUser(rows[0]);
  }

  private authRowToUser(row: AuthUserRow): User {
    return this.db.manager.create(User, {
      id: row.id,
      email: row.email,
      username: row.username,
      passwordHash: row.password_hash,
      avatarColor: row.avatar_color,
      isActive: row.is_active,
    });
  }

  async createLocalUser(input: {
    email: string;
    username: string;
    passwordHash: string;
    avatarColor?: string;
  }): Promise<User> {
    const id = randomUUID();
    return this.db.runInRlsTransaction(id, async () => {
      const user = this.db.manager.create(User, {
        id,
        email: input.email.toLowerCase(),
        username: input.username,
        passwordHash: input.passwordHash,
        avatarColor: input.avatarColor ?? this.pickAvatarColor(input.email),
        isActive: true,
      });
      return this.db.manager.save(User, user);
    });
  }

  private pickAvatarColor(seed: string): string {
    const colors = [
      '#2563eb',
      '#059669',
      '#dc2626',
      '#7c3aed',
      '#ea580c',
      '#0891b2',
    ];
    const total = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return colors[total % colors.length];
  }
}
