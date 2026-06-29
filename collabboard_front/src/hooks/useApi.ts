'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/src/lib/axios';
import type { Board, BoardRole, Note, NoteHistory } from '@/src/lib/types';
import { useBoardStore } from '@/src/store/boardStore';

export function useBoards() {
  const queryClient = useQueryClient();
  const boards = useQuery({ queryKey: ['boards'], queryFn: async () => (await api.get<Board[]>('/boards')).data });
  const createBoard = useMutation({
    mutationFn: async (body: { name: string; description?: string }) => (await api.post<Board>('/boards', body)).data,
    onSuccess: (created) => {
      queryClient.setQueryData<Board[]>(['boards'], (current = []) => [created, ...current.filter((board) => board.id !== created.id)]);
    },
  });
  return { ...boards, createBoard };
}

export function useBoard(boardId: string) {
  const queryClient = useQueryClient();
  const board = useQuery({ queryKey: ['board', boardId], queryFn: async () => (await api.get<Board>(`/boards/${boardId}`)).data, enabled: Boolean(boardId) });
  const updateBoard = useMutation({
    mutationFn: async (body: { name?: string; description?: string }) => (await api.patch<Board>(`/boards/${boardId}`, body)).data,
    onSuccess: (data) => {
      queryClient.setQueryData(['board', boardId], data);
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
  });
  const deleteBoard = useMutation({
    mutationFn: async () => (await api.delete(`/boards/${boardId}`)).data,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['boards'] });
      const previous = queryClient.getQueryData<Board[]>(['boards']);
      queryClient.setQueryData<Board[]>(['boards'], (current = []) => current.filter((item) => item.id !== boardId));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(['boards'], context.previous);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['board', boardId] });
      queryClient.removeQueries({ queryKey: ['notes', boardId] });
    },
  });
  const inviteMember = useMutation({
    mutationFn: async (body: { email: string; role: 'editor' | 'viewer' }) => (await api.post(`/boards/${boardId}/members`, body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['board', boardId] }),
  });
  const changeRole = useMutation({
    mutationFn: async (input: { userId: string; role: BoardRole }) => (await api.patch(`/boards/${boardId}/members/${input.userId}`, { role: input.role })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['board', boardId] }),
  });
  const removeMember = useMutation({
    mutationFn: async (userId: string) => (await api.delete(`/boards/${boardId}/members/${userId}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['board', boardId] }),
  });
  return { ...board, updateBoard, deleteBoard, inviteMember, changeRole, removeMember };
}

export function useNotes(boardId: string) {
  const queryClient = useQueryClient();
  const notes = useQuery({ queryKey: ['notes', boardId], queryFn: async () => (await api.get<Note[]>(`/boards/${boardId}/notes`)).data, enabled: Boolean(boardId) });
  const createNote = useMutation({
    mutationFn: async (body: Partial<Note>) => (await api.post<Note>(`/boards/${boardId}/notes`, body)).data,
    onSuccess: (created) => {
      queryClient.setQueryData<Note[]>(['notes', boardId], (current = []) => [...current.filter((note) => note.id !== created.id), created]);
      useBoardStore.getState().addNote(created);
    },
  });
  const updatePosition = useMutation({
    mutationFn: async (input: { id: string; current_version: number; positionX: number; positionY: number; zIndex: number }) => {
      const { id, current_version, positionX, positionY, zIndex } = input;
      return (await api.patch<Note>(`/boards/${boardId}/notes/${id}/position`, { current_version, positionX, positionY, zIndex })).data;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<Note[]>(['notes', boardId], (current = []) =>
        current.map((note) => note.id === saved.id ? saved : note),
      );
    },
  });
  const updateNote = useMutation({
    mutationFn: async (input: { id: string; current_version: number } & Partial<Note>) => {
      const { id, current_version, title, content, color, width, height, isPinned } = input;
      return (await api.patch<Note>(`/boards/${boardId}/notes/${id}`, { current_version, title, content, color, width, height, isPinned })).data;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<Note[]>(['notes', boardId], (current = []) =>
        current.map((note) => note.id === saved.id ? saved : note),
      );
      useBoardStore.getState().patchNote(saved.id, saved);
    },
  });
  const deleteNote = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/boards/${boardId}/notes/${id}`)).data,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notes', boardId] });
      const previous = queryClient.getQueryData<Note[]>(['notes', boardId]);
      const removed = useBoardStore.getState().notes[id];
      queryClient.setQueryData<Note[]>(['notes', boardId], (current = []) => current.filter((note) => note.id !== id));
      useBoardStore.getState().removeNote(id);
      return { previous, removed };
    },
    onError: (_error, id, context) => {
      if (context?.previous) queryClient.setQueryData(['notes', boardId], context.previous);
      if (context?.removed) useBoardStore.getState().restoreDeletedNote(id);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notes', boardId] }),
  });
  const restoreNote = useMutation({
    mutationFn: async (id: string) => (await api.post<Note>(`/boards/${boardId}/notes/${id}/restore`)).data,
    onSuccess: (restored) => {
      queryClient.setQueryData<Note[]>(['notes', boardId], (current = []) => [...current.filter((note) => note.id !== restored.id), restored]);
      useBoardStore.getState().addNote(restored);
    },
  });
  return { ...notes, createNote, updatePosition, updateNote, deleteNote, restoreNote };
}

export function useNoteHistory(boardId: string, noteId?: string) {
  return useQuery({
    queryKey: ['note-history', boardId, noteId],
    queryFn: async () => (await api.get<NoteHistory[]>(`/boards/${boardId}/notes/${noteId}/history`)).data,
    enabled: Boolean(boardId && noteId),
  });
}

export function useRole(board?: Board | null, userId?: string) {
  return useMemo(() => board?.members?.find((member) => member.userId === userId)?.role, [board, userId]);
}
