'use client';

import { create } from 'zustand';
import type { ActiveUser, Board, BoardMember, ConflictPayload, Note } from '@/src/lib/types';

type BoardState = {
  board: Board | null;
  members: BoardMember[];
  notes: Record<string, Note>;
  activeUsers: ActiveUser[];
  deletedNotes: Note[];
  pending: Record<string, Note>;
  conflict: ConflictPayload | null;
  realtimeStatus: 'connecting' | 'connected' | 'disconnected';
  realtimeError: string | null;
  setBoard: (board: Board | null) => void;
  setMembers: (members: BoardMember[]) => void;
  setNotes: (notes: Note[]) => void;
  addNote: (note: Note) => void;
  patchNote: (id: string, patch: Partial<Note>) => void;
  removeNote: (id: string) => void;
  restoreDeletedNote: (id: string) => void;
  setActiveUsers: (users: ActiveUser[]) => void;
  upsertActiveUser: (user: ActiveUser) => void;
  removeActiveUser: (userId: string) => void;
  rememberPending: (note: Note) => void;
  rollbackPending: (id: string) => void;
  clearPending: (id: string) => void;
  setConflict: (conflict: ConflictPayload | null) => void;
  setRealtimeStatus: (status: BoardState['realtimeStatus']) => void;
  setRealtimeError: (error: string | null) => void;
};

function sameNote(a?: Note, b?: Note) {
  if (!a || !b) return false;
  return a.id === b.id && a.version === b.version && a.title === b.title && a.content === b.content && a.color === b.color && a.positionX === b.positionX && a.positionY === b.positionY && a.width === b.width && a.height === b.height && a.zIndex === b.zIndex && a.isPinned === b.isPinned && a.deletedAt === b.deletedAt;
}

export const useBoardStore = create<BoardState>((set) => ({
  board: null,
  members: [],
  notes: {},
  activeUsers: [],
  deletedNotes: [],
  pending: {},
  conflict: null,
  realtimeStatus: 'disconnected',
  realtimeError: null,
  setBoard: (board) => set((state) => {
    const changedBoard = Boolean(state.board?.id && board?.id && state.board.id !== board.id);
    if (!changedBoard) return { board };
    return {
      board,
      members: [],
      notes: {},
      activeUsers: [],
      deletedNotes: [],
      pending: {},
      conflict: null,
      realtimeError: null,
    };
  }),
  setMembers: (members) => set({ members }),
  setNotes: (notes) => set((state) => {
    const next = Object.fromEntries(notes.map((note) => [note.id, note]));
    const prev = state.notes;
    const nextIds = Object.keys(next);
    const prevIds = Object.keys(prev);
    const isSame = nextIds.length === prevIds.length && nextIds.every((id) => sameNote(prev[id], next[id]));
    return isSame ? state : { notes: next };
  }),
  addNote: (note) => set((state) => ({
    notes: {
      ...state.notes,
      [note.id]: state.notes[note.id] && state.notes[note.id].version > note.version
        ? state.notes[note.id]
        : note,
    },
    deletedNotes: state.deletedNotes.filter((deleted) => deleted.id !== note.id),
  })),
  patchNote: (id, patch) => set((state) => {
    const note = state.notes[id];
    if (!note) return state;
    if (patch.version !== undefined && patch.version < note.version) return state;
    return { notes: { ...state.notes, [id]: { ...note, ...patch } } };
  }),
  removeNote: (id) => set((state) => {
    const { [id]: removed, ...notes } = state.notes;
    return { notes, deletedNotes: removed ? [removed, ...state.deletedNotes] : state.deletedNotes };
  }),
  restoreDeletedNote: (id) => set((state) => {
    const restored = state.deletedNotes.find((note) => note.id === id);
    if (!restored) return state;
    return {
      notes: { ...state.notes, [id]: { ...restored, deletedAt: null } },
      deletedNotes: state.deletedNotes.filter((note) => note.id !== id),
    };
  }),
  setActiveUsers: (activeUsers) => set({ activeUsers }),
  upsertActiveUser: (user) => set((state) => {
    if (!user.userId) return state;
    const existing = state.activeUsers.find((active) => active.userId === user.userId);
    if (!existing) return { activeUsers: [...state.activeUsers, user] };
    return { activeUsers: state.activeUsers.map((active) => active.userId === user.userId ? { ...active, ...user } : active) };
  }),
  removeActiveUser: (userId) => set((state) => ({ activeUsers: state.activeUsers.filter((user) => user.userId !== userId) })),
  rememberPending: (note) => set((state) => ({ pending: { ...state.pending, [note.id]: note } })),
  rollbackPending: (id) => set((state) => {
    const original = state.pending[id];
    if (!original) return state;
    const { [id]: _removed, ...pending } = state.pending;
    return { notes: { ...state.notes, [id]: original }, pending };
  }),
  clearPending: (id) => set((state) => {
    const { [id]: _removed, ...pending } = state.pending;
    return { pending };
  }),
  setConflict: (conflict) => set({ conflict }),
  setRealtimeStatus: (realtimeStatus) => set({ realtimeStatus }),
  setRealtimeError: (realtimeError) => set({ realtimeError }),
}));
