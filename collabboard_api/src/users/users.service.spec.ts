import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { DatabaseService } from '../database/database.service';

describe('UsersService', () => {
  let service: UsersService;
  let mockDb: any;

  beforeEach(async () => {
    // 1. Build a fake DatabaseService.
    //    We only fake the parts UsersService actually calls: db.manager.findOne
    mockDb = {
      manager: {
        query: jest.fn(),
        create: jest.fn(),
      },
    };

    // 2. Build a mini NestJS app just for this test, swapping in our fake
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();

    // 3. Pull the real UsersService out of that mini app
    //    (it's "real" — only its dependency, DatabaseService, is fake)
    service = module.get<UsersService>(UsersService);
  });

  describe('findById', () => {
    it('returns the user when found', async () => {
      const row = {
        id: 'abc-123',
        email: 'test@test.com',
        username: 'tester',
        password_hash: 'hash',
        avatar_color: '#2563eb',
        is_active: true,
      };
      const fakeUser = { id: row.id, email: row.email, isActive: true };
      mockDb.manager.query.mockResolvedValue([row]);
      mockDb.manager.create.mockReturnValue(fakeUser);

      const result = await service.findById('abc-123');

      expect(result).toEqual(fakeUser);
      expect(mockDb.manager.query).toHaveBeenCalledWith(
        'SELECT * FROM find_user_by_id_for_auth($1)',
        ['abc-123'],
      );
    });

    it('returns null when not found', async () => {
      mockDb.manager.query.mockResolvedValue([]);

      const result = await service.findById('does-not-exist');

      expect(result).toBeNull();
    });
  });

  describe('getById', () => {
    it('returns the user when found', async () => {
      const fakeUser = { id: 'abc-123', email: 'test@test.com' };
      mockDb.manager.query.mockResolvedValue([{
        id: fakeUser.id,
        email: fakeUser.email,
        username: 'tester',
        password_hash: 'hash',
        avatar_color: '#2563eb',
        is_active: true,
      }]);
      mockDb.manager.create.mockReturnValue(fakeUser);

      const result = await service.getById('abc-123');

      expect(result).toEqual(fakeUser);
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockDb.manager.query.mockResolvedValue([]);

      await expect(service.getById('ghost-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('lowercases the email before querying', async () => {
      mockDb.manager.query.mockResolvedValue([]);

      await service.findByEmail('TEST@Example.com');

      expect(mockDb.manager.query).toHaveBeenCalledWith(
        'SELECT * FROM find_user_for_auth($1)',
        ['test@example.com'],
      );
    });
  });

  describe('createLocalUser', () => {
  it('creates and saves a user inside an RLS transaction', async () => {
    const fakeCreatedUser = { id: 'new-id', email: 'jane@test.com' };

    // Mock runInRlsTransaction so it just immediately runs the callback
    // it's given, instead of touching a real transaction/queryRunner.
    mockDb.runInRlsTransaction = jest.fn((userId, work) => work());

    // Inside the real callback, the code calls this.db.manager.create() and .save()
    mockDb.manager.create = jest.fn().mockReturnValue(fakeCreatedUser);
    mockDb.manager.save = jest.fn().mockResolvedValue(fakeCreatedUser);

    const result = await service.createLocalUser({
      email: 'Jane@Test.com',
      username: 'jane',
      passwordHash: 'hashed-password-here',
    });

    expect(result).toEqual(fakeCreatedUser);
    expect(mockDb.runInRlsTransaction).toHaveBeenCalledTimes(1);
    expect(mockDb.manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: 'jane@test.com', username: 'jane' }),
    );
  });

  it('assigns a deterministic avatar color when none is provided', async () => {
    mockDb.runInRlsTransaction = jest.fn((userId, work) => work());
    mockDb.manager.create = jest.fn((entity, data) => data);
    mockDb.manager.save = jest.fn((entity, data) => Promise.resolve(data));

    const result = await service.createLocalUser({
      email: 'same-seed@test.com',
      username: 'tester',
      passwordHash: 'hash',
    });

    // We don't know which exact color it picks without running the math,
    // but we DO know it must be one of the 6 defined colors, and that
    // calling it again with the same email gives the same color.
    const validColors = ['#2563eb', '#059669', '#dc2626', '#7c3aed', '#ea580c', '#0891b2'];
    expect(validColors).toContain(result.avatarColor);

    const second = await service.createLocalUser({
      email: 'same-seed@test.com',
      username: 'tester2',
      passwordHash: 'hash',
    });
    expect(second.avatarColor).toBe(result.avatarColor);
  });
});
});
