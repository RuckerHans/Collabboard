import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<User | null> {
    return this.db.manager.findOne(User, { where: { id, isActive: true } });
  }

  async getById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.db.manager.findOne(User, {
      where: { email: email.toLowerCase(), isActive: true },
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
