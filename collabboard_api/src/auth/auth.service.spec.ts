import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';

// This tells Jest: "replace the entire bcrypt module with auto-mocked
// fake functions for every test in this file." Every exported function
// (hash, compare, etc.) becomes a jest.fn() automatically — we just
// configure what each one returns, per test.
jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let mockUsers: any;
  let mockJwt: any;

  beforeEach(async () => {
    mockUsers = {
      createLocalUser: jest.fn(),
      findByEmail: jest.fn(),
      getById: jest.fn(),
    };
    mockJwt = {
      sign: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsers },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Clear any mock call history/return values from the previous test,
    // since jest.mock('bcrypt') makes ONE shared fake module —
    // it doesn't get torn down and rebuilt by beforeEach automatically
    // the way mockUsers/mockJwt do above.
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('hashes the password and creates a user', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password-123');
      const fakeUser = { id: 'u1', email: 'jane@test.com', username: 'jane' };
      mockUsers.createLocalUser.mockResolvedValue(fakeUser);
      mockJwt.sign.mockReturnValue('fake-jwt-token');

      const result = await service.register({
        email: 'jane@test.com',
        username: 'jane',
        password: 'plaintext123',
      });

      // Confirms bcrypt was actually called with the right cost factor (12)
      expect(bcrypt.hash).toHaveBeenCalledWith('plaintext123', 12);
      // Confirms the HASH, not the plaintext, is what gets passed onward
      expect(mockUsers.createLocalUser).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'hashed-password-123' }),
      );
      expect(result.access_token).toBe('fake-jwt-token');
      expect(result.user.email).toBe('jane@test.com');
    });
  });

  describe('login', () => {
    it('returns an auth response when credentials are correct', async () => {
      const fakeUser = {
        id: 'u1',
        email: 'jane@test.com',
        username: 'jane',
        passwordHash: 'stored-hash',
      };
      mockUsers.findByEmail.mockResolvedValue(fakeUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwt.sign.mockReturnValue('fake-jwt-token');

      const result = await service.login('jane@test.com', 'correct-password');

      expect(bcrypt.compare).toHaveBeenCalledWith('correct-password', 'stored-hash');
      expect(result.access_token).toBe('fake-jwt-token');
    });

    it('throws UnauthorizedException if the user does not exist', async () => {
      mockUsers.findByEmail.mockResolvedValue(null);

      await expect(service.login('ghost@test.com', 'anything')).rejects.toThrow(
        UnauthorizedException,
      );
      // bcrypt.compare should never even be called — no point comparing
      // against a password hash that doesn't exist
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException if the password is wrong', async () => {
      const fakeUser = { id: 'u1', email: 'jane@test.com', passwordHash: 'stored-hash' };
      mockUsers.findByEmail.mockResolvedValue(fakeUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login('jane@test.com', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException if the user has no passwordHash (OAuth-only account)', async () => {
      const fakeUser = { id: 'u1', email: 'jane@test.com', passwordHash: null };
      mockUsers.findByEmail.mockResolvedValue(fakeUser);

      await expect(service.login('jane@test.com', 'anything')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });

  describe('validateJwt', () => {
    it('looks up the user by the JWT payload sub claim', async () => {
      const fakeUser = { id: 'u1', email: 'jane@test.com' };
      mockUsers.getById.mockResolvedValue(fakeUser);

      const result = await service.validateJwt({
        sub: 'u1',
        email: 'jane@test.com',
        username: 'jane',
      });

      expect(mockUsers.getById).toHaveBeenCalledWith('u1');
      expect(result).toEqual(fakeUser);
    });
  });

  describe('buildAuthResponse', () => {
    it('signs a JWT with sub, email, and username', () => {
      mockJwt.sign.mockReturnValue('signed-token');
      const fakeUser = { id: 'u1', email: 'jane@test.com', username: 'jane' };

      const result = service.buildAuthResponse(fakeUser as any);

      expect(mockJwt.sign).toHaveBeenCalledWith({
        sub: 'u1',
        email: 'jane@test.com',
        username: 'jane',
      });
      expect(result.access_token).toBe('signed-token');
    });
  });
});