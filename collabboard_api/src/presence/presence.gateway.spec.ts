import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { NoteLockService } from '../notes/note-lock.service';
import { NotesService } from '../notes/notes.service';
import { UsersService } from '../users/users.service';
import { PresenceGateway } from './presence.gateway';
import { PresenceService } from './presence.service';

describe('PresenceGateway membership revocation', () => {
  it('releases only locks tracked by the disconnecting socket', async () => {
    const client = {
      id: 'socket-board-1',
      user: { id: 'user-1' },
      data: {
        boardIds: ['board-1'],
        lockedNotesByBoard: { 'board-1': ['note-1'] },
      },
    };
    const roomEmit = jest.fn();
    const server = {
      to: jest.fn(() => ({ emit: roomEmit })),
    };
    const presence = {
      leaveBoard: jest.fn().mockResolvedValue(undefined),
    };
    const noteLocks = {
      release: jest.fn().mockResolvedValue(true),
    };
    const gateway = new PresenceGateway(
      {} as JwtService,
      {} as UsersService,
      presence as unknown as PresenceService,
      {} as NotesService,
      noteLocks as unknown as NoteLockService,
    );
    gateway.server = server as unknown as Server;

    await gateway.handleDisconnect(client as never);

    expect(noteLocks.release).toHaveBeenCalledTimes(1);
    expect(noteLocks.release).toHaveBeenCalledWith('note-1', 'user-1');
    expect(server.to).toHaveBeenCalledWith('board:board-1');
    expect(roomEmit).toHaveBeenCalledWith('note_unlocked', {
      noteId: 'note-1',
    });
  });

  it('removes Redis presence and evicts the removed member from the room', async () => {
    const room = 'board:board-1';
    const rooms = new Set([room]);
    const leave = jest.fn(async (roomName: string) => {
      rooms.delete(roomName);
    });
    const client = {
      user: { id: 'user-1' },
      data: {
        boardIds: ['board-1', 'board-2'],
        lockedNotesByBoard: {
          'board-1': ['note-1'],
          'board-2': ['note-2'],
        },
      },
      rooms,
      leave,
      emit: jest.fn(),
    };
    const roomEmit = jest.fn();
    const server = {
      sockets: { sockets: new Map([['socket-1', client]]) },
      to: jest.fn(() => ({ emit: roomEmit })),
    };
    const presence = {
      removeUser: jest.fn().mockResolvedValue(undefined),
    };
    const noteLocks = {
      release: jest.fn().mockResolvedValue(true),
    };
    const gateway = new PresenceGateway(
      {} as JwtService,
      {} as UsersService,
      presence as unknown as PresenceService,
      {} as NotesService,
      noteLocks as unknown as NoteLockService,
    );
    gateway.server = server as unknown as Server;

    await gateway.handleBoardNotify({
      channel: 'board_events',
      payload: {
        table: 'board_members',
        operation: 'DELETE',
        boardId: 'board-1',
        userId: 'user-1',
        id: 'membership-1',
      },
    });

    expect(presence.removeUser).toHaveBeenCalledWith('board-1', 'user-1');
    expect(leave).toHaveBeenCalledWith(room);
    expect(client.data.boardIds).toEqual(['board-2']);
    expect(client.data.lockedNotesByBoard).toEqual({
      'board-2': ['note-2'],
    });
    expect(noteLocks.release).toHaveBeenCalledWith('note-1', 'user-1');
    expect(noteLocks.release).not.toHaveBeenCalledWith('note-2', 'user-1');
    expect(client.emit).toHaveBeenCalledWith('board_access_revoked', {
      boardId: 'board-1',
    });
    expect(roomEmit).toHaveBeenCalledWith('note_unlocked', {
      noteId: 'note-1',
    });
    expect(roomEmit).toHaveBeenCalledWith('user_left', { userId: 'user-1' });
  });

  it('acquires and releases note locks through socket events', async () => {
    const client = {
      id: 'socket-1',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        username: 'User One',
        avatarColor: '#123456',
      },
      data: { boardIds: ['board-1'] },
      rooms: new Set(['board:board-1']),
      emit: jest.fn(),
    };
    const roomEmit = jest.fn();
    const noteLocks = {
      acquire: jest.fn().mockResolvedValue(true),
      release: jest.fn().mockResolvedValue(true),
    };
    const gateway = new PresenceGateway(
      {} as JwtService,
      {} as UsersService,
      {} as PresenceService,
      {} as NotesService,
      noteLocks as unknown as NoteLockService,
    );
    gateway.server = {
      to: jest.fn(() => ({ emit: roomEmit })),
    } as unknown as Server;

    await gateway.noteLockRequest(client as never, {
      boardId: 'board-1',
      noteId: 'note-1',
    });
    await gateway.noteLockRelease(client as never, {
      boardId: 'board-1',
      noteId: 'note-1',
    });

    expect(noteLocks.acquire).toHaveBeenCalledWith('note-1', 'user-1');
    expect(noteLocks.release).toHaveBeenCalledWith('note-1', 'user-1');
    expect(roomEmit).toHaveBeenCalledWith('note_locked', {
      noteId: 'note-1',
      userId: 'user-1',
      username: 'User One',
    });
    expect(roomEmit).toHaveBeenCalledWith('note_unlocked', {
      noteId: 'note-1',
    });
    expect(client.data).toEqual({
      boardIds: ['board-1'],
      lockedNotesByBoard: { 'board-1': [] },
    });
  });

  it('emits a distinct conflict event when another user holds the lock', async () => {
    const client = {
      user: {
        id: 'user-1',
        email: 'user@example.com',
        username: 'User One',
        avatarColor: '#123456',
      },
      emit: jest.fn(),
    };
    const notes = {
      updateFromSocket: jest
        .fn()
        .mockRejectedValue(
          new ConflictException({ error: 'locked', heldBy: 'user-2' }),
        ),
    };
    const gateway = new PresenceGateway(
      {} as JwtService,
      {} as UsersService,
      {} as PresenceService,
      notes as unknown as NotesService,
      {} as NoteLockService,
    );

    await gateway.noteUpdate(client as never, {
      boardId: 'board-1',
      noteId: 'note-1',
      currentVersion: 1,
      title: 'Blocked edit',
    });

    expect(client.emit).toHaveBeenCalledWith('note_lock_conflict', {
      noteId: 'note-1',
      heldBy: 'user-2',
    });
    expect(client.emit).not.toHaveBeenCalledWith(
      'note_conflict',
      expect.anything(),
    );
  });
});
