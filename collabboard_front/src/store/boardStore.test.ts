import { describe, it, expect, beforeEach } from 'vitest';
import { useBoardStore } from './boardStore';
import type { Note } from '@/src/lib/types';

// Helper to build a minimal valid Note for tests, so every test
// isn't repeating every single field Note requires.
function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    title: 'Test note',
    content: 'hello',
    color: 'yellow',
    positionX: 0,
    positionY: 0,
    width: 100,
    height: 100,
    zIndex: 1,
    isPinned: false,
    deletedAt: null,
    version: 1,
    ...overrides,
  } as Note;
}

describe('useBoardStore', () => {
  beforeEach(() => {
    // Reset the store to its initial shape before every test.
    // Without this, state from one test leaks into the next.
    useBoardStore.setState({
      board: null,
      members: [],
      notes: {},
      activeUsers: [],
      deletedNotes: [],
      pending: {},
      conflict: null,
    });
  });

  describe('addNote', () => {
    it('adds a note to the notes map', () => {
      const note = makeNote();
      useBoardStore.getState().addNote(note);

      expect(useBoardStore.getState().notes['note-1']).toEqual(note);
    });
  });

  describe('patchNote', () => {
    it('merges the patch into an existing note', () => {
      useBoardStore.getState().addNote(makeNote());
      useBoardStore.getState().patchNote('note-1', { title: 'Updated title' });

      const result = useBoardStore.getState().notes['note-1'];
      expect(result.title).toBe('Updated title');
      expect(result.content).toBe('hello'); // untouched fields survive
    });

    it('does nothing if the note does not exist', () => {
      const before = useBoardStore.getState().notes;
      useBoardStore.getState().patchNote('ghost-id', { title: 'x' });

      expect(useBoardStore.getState().notes).toBe(before); // same reference, no change
    });
  });

  describe('removeNote', () => {
    it('moves a note from notes into deletedNotes', () => {
      useBoardStore.getState().addNote(makeNote());
      useBoardStore.getState().removeNote('note-1');

      const state = useBoardStore.getState();
      expect(state.notes['note-1']).toBeUndefined();
      expect(state.deletedNotes).toHaveLength(1);
      expect(state.deletedNotes[0].id).toBe('note-1');
    });

    it('restores a deleted note without duplicating it', () => {
      useBoardStore.getState().addNote(makeNote());
      useBoardStore.getState().removeNote('note-1');
      useBoardStore.getState().restoreDeletedNote('note-1');

      const state = useBoardStore.getState();
      expect(state.notes['note-1']?.deletedAt).toBeNull();
      expect(state.deletedNotes).toHaveLength(0);
    });
  });

  describe('setBoard', () => {
    it('clears board-scoped state when navigating to another board', () => {
      useBoardStore.getState().setBoard({ id: 'board-1' } as any);
      useBoardStore.getState().addNote(makeNote());
      useBoardStore.getState().removeNote('note-1');

      useBoardStore.getState().setBoard({ id: 'board-2' } as any);

      const state = useBoardStore.getState();
      expect(state.board?.id).toBe('board-2');
      expect(state.notes).toEqual({});
      expect(state.deletedNotes).toEqual([]);
      expect(state.activeUsers).toEqual([]);
    });
  });

  describe('optimistic update flow: rememberPending → rollbackPending', () => {
    it('restores the original note on rollback', () => {
      const original = makeNote({ title: 'Original' });
      useBoardStore.getState().addNote(original);

      // Simulate: user edits the note, we remember the pre-edit version
      useBoardStore.getState().rememberPending(original);
      useBoardStore.getState().patchNote('note-1', { title: 'Optimistic edit' });

      expect(useBoardStore.getState().notes['note-1'].title).toBe('Optimistic edit');

      // Server rejected the edit — roll back
      useBoardStore.getState().rollbackPending('note-1');

      expect(useBoardStore.getState().notes['note-1'].title).toBe('Original');
      expect(useBoardStore.getState().pending['note-1']).toBeUndefined();
    });
  });

  describe('upsertActiveUser', () => {
    it('adds a new active user if not present', () => {
      useBoardStore.getState().upsertActiveUser({ userId: 'u1', username: 'Alice' } as any);

      expect(useBoardStore.getState().activeUsers).toHaveLength(1);
    });

    it('merges into an existing active user instead of duplicating', () => {
      useBoardStore.getState().upsertActiveUser({ userId: 'u1', username: 'Alice' } as any);
      useBoardStore.getState().upsertActiveUser({ userId: 'u1', username: 'Alice Updated' } as any);

      const users = useBoardStore.getState().activeUsers;
      expect(users).toHaveLength(1);
      expect(users[0].username).toBe('Alice Updated');
    });

    it('ignores users with no userId', () => {
      const before = useBoardStore.getState().activeUsers;
      useBoardStore.getState().upsertActiveUser({ userId: undefined, username: 'Ghost' } as any);

      expect(useBoardStore.getState().activeUsers).toBe(before);
    });
  });
});
