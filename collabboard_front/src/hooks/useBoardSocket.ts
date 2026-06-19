'use client';

import { useEffect, useRef } from 'react';
import { useSocket } from '@/src/hooks/useSocket';
import type { ActiveUser, BoardState, ConflictPayload, Note } from '@/src/lib/types';
import { useBoardStore } from '@/src/store/boardStore';

function pickNotePayload(payload: any) {
  return payload?.after_snapshot ?? payload?.afterSnapshot ?? payload?.note ?? payload;
}

function pickDeletedNotePayload(payload: any) {
  return payload?.before_snapshot ?? payload?.beforeSnapshot ?? payload?.after_snapshot ?? payload?.afterSnapshot ?? payload?.note ?? payload;
}

function has(source: any, camel: string, snake: string) {
  return source && (Object.prototype.hasOwnProperty.call(source, camel) || Object.prototype.hasOwnProperty.call(source, snake));
}

function value(source: any, camel: string, snake: string) {
  return source?.[camel] ?? source?.[snake];
}

function noteIdFromPayload(payload: any) {
  const note = pickDeletedNotePayload(payload);
  return String(note?.id ?? note?.note_id ?? payload?.id ?? payload?.note_id ?? '');
}

function normalizeFullNote(payload: any): Note | null {
  const note = pickNotePayload(payload);
  const id = note?.id ?? note?.note_id;
  const boardId = note?.boardId ?? note?.board_id;
  const createdBy = note?.createdBy ?? note?.created_by;
  if (!id || !boardId || !createdBy || !has(note, 'positionX', 'position_x') || !has(note, 'positionY', 'position_y')) {
    return null;
  }
  return {
    id,
    boardId,
    createdBy,
    title: note.title,
    content: note.content,
    color: note.color,
    positionX: Number(value(note, 'positionX', 'position_x')),
    positionY: Number(value(note, 'positionY', 'position_y')),
    width: Number(value(note, 'width', 'width') ?? 280),
    height: Number(value(note, 'height', 'height') ?? 180),
    zIndex: Number(value(note, 'zIndex', 'z_index') ?? 0),
    version: Number(note.version ?? note.currentVersion ?? 1),
    isPinned: Boolean(value(note, 'isPinned', 'is_pinned') ?? false),
    deletedAt: note.deletedAt ?? note.deleted_at ?? null,
  };
}

function normalizeNotePatch(payload: any): { id: string; patch: Partial<Note> } | null {
  const note = pickNotePayload(payload);
  const id = String(note?.id ?? note?.note_id ?? payload?.id ?? payload?.note_id ?? '');
  if (!id) return null;

  const patch: Partial<Note> = {};
  if (has(note, 'boardId', 'board_id')) patch.boardId = String(value(note, 'boardId', 'board_id'));
  if (has(note, 'createdBy', 'created_by')) patch.createdBy = String(value(note, 'createdBy', 'created_by'));
  if (Object.prototype.hasOwnProperty.call(note, 'title')) patch.title = note.title;
  if (Object.prototype.hasOwnProperty.call(note, 'content')) patch.content = note.content;
  if (Object.prototype.hasOwnProperty.call(note, 'color')) patch.color = note.color;
  if (has(note, 'positionX', 'position_x')) patch.positionX = Number(value(note, 'positionX', 'position_x'));
  if (has(note, 'positionY', 'position_y')) patch.positionY = Number(value(note, 'positionY', 'position_y'));
  if (Object.prototype.hasOwnProperty.call(note, 'width')) patch.width = Number(note.width);
  if (Object.prototype.hasOwnProperty.call(note, 'height')) patch.height = Number(note.height);
  if (has(note, 'zIndex', 'z_index')) patch.zIndex = Number(value(note, 'zIndex', 'z_index'));
  if (Object.prototype.hasOwnProperty.call(note, 'version')) patch.version = Number(note.version);
  if (has(note, 'isPinned', 'is_pinned')) patch.isPinned = Boolean(value(note, 'isPinned', 'is_pinned'));
  if (has(note, 'deletedAt', 'deleted_at')) patch.deletedAt = value(note, 'deletedAt', 'deleted_at') ?? null;

  return { id, patch };
}

function normalizePresence(payload: any): ActiveUser | null {
  const source = payload?.after_snapshot ?? payload?.afterSnapshot ?? payload?.record ?? payload;
  const userId = source?.userId ?? source?.user_id;
  if (!userId) return null;
  return {
    userId: String(userId),
    username: String(source.username ?? source.email ?? 'Online'),
    avatarColor: String(source.avatarColor ?? source.avatar_color ?? '#64748b'),
    cursorX: source.cursorX ?? source.cursor_x,
    cursorY: source.cursorY ?? source.cursor_y,
    isTyping: source.isTyping ?? source.is_typing,
    currentNoteId: source.currentNoteId ?? source.current_note_id,
  };
}

export function useBoardSocket(boardId: string) {
  const socket = useSocket();
  const setNotes = useBoardStore((state) => state.setNotes);
  const setMembers = useBoardStore((state) => state.setMembers);
  const addNote = useBoardStore((state) => state.addNote);
  const patchNote = useBoardStore((state) => state.patchNote);
  const removeNote = useBoardStore((state) => state.removeNote);
  const setActiveUsers = useBoardStore((state) => state.setActiveUsers);
  const upsertActiveUser = useBoardStore((state) => state.upsertActiveUser);
  const removeActiveUser = useBoardStore((state) => state.removeActiveUser);
  const setConflict = useBoardStore((state) => state.setConflict);
  const currentBoard = useRef(boardId);
  const joinedBoard = useRef<string | null>(null);
  currentBoard.current = boardId;

  useEffect(() => {
    if (!socket || !boardId) return;

    const join = () => {
      if (joinedBoard.current === boardId && socket.connected) return;
      socket.emit('join_board', { boardId });
      joinedBoard.current = boardId;
    };
    const boardState = (state: BoardState) => {
      setNotes((state.notes ?? []).map((note) => normalizeFullNote(note)).filter((note): note is Note => Boolean(note)));
      setMembers(state.members ?? []);
      setActiveUsers(state.activeUsers ?? []);
    };
    const noteCreated = (payload: any) => {
      const note = normalizeFullNote(payload);
      if (note) addNote(note);
    };
    const noteUpdated = (payload: any) => {
      const normalized = normalizeNotePatch(payload);
      if (normalized && Object.keys(normalized.patch).length > 0) patchNote(normalized.id, normalized.patch);
    };
    const noteDeleted = (payload: any) => {
      const id = noteIdFromPayload(payload);
      if (id) removeNote(id);
    };
    const presenceUpdated = (payload: ActiveUser | ActiveUser[]) => {
      if (Array.isArray(payload)) {
        setActiveUsers(payload);
        return;
      }
      const active = normalizePresence(payload);
      if (active) upsertActiveUser(active);
    };
    const userJoined = (payload: { userId?: string }) => {
      if (payload.userId) upsertActiveUser({ userId: payload.userId, username: 'Online', avatarColor: '#64748b' });
    };
    const userLeft = (payload: { userId?: string }) => {
      if (payload.userId) removeActiveUser(payload.userId);
    };
    const conflict = (payload: ConflictPayload) => setConflict(payload);

    socket.on('connect', join);
    socket.on('board_state', boardState);
    socket.on('note_created', noteCreated);
    socket.on('note_updated', noteUpdated);
    socket.on('note_deleted', noteDeleted);
    socket.on('presence_updated', presenceUpdated);
    socket.on('user_joined', userJoined);
    socket.on('user_left', userLeft);
    socket.on('note_conflict', conflict);
    join();

    return () => {
      socket.emit('leave_board', { boardId: currentBoard.current });
      joinedBoard.current = null;
      socket.off('connect', join);
      socket.off('board_state', boardState);
      socket.off('note_created', noteCreated);
      socket.off('note_updated', noteUpdated);
      socket.off('note_deleted', noteDeleted);
      socket.off('presence_updated', presenceUpdated);
      socket.off('user_joined', userJoined);
      socket.off('user_left', userLeft);
      socket.off('note_conflict', conflict);
    };
  }, [socket, boardId, setNotes, setMembers, addNote, patchNote, removeNote, setActiveUsers, upsertActiveUser, removeActiveUser, setConflict]);

  return socket;
}
