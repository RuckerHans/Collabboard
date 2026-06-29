'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoardToolbar } from '@/src/components/board/BoardToolbar';
import { ConflictToast } from '@/src/components/board/ConflictToast';
import { NoteHistoryModal } from '@/src/components/board/NoteHistoryModal';
import { StickyNoteCard } from '@/src/components/board/StickyNoteCard';
import { useAuth } from '@/src/hooks/useAuth';
import { useBoard, useNotes, useRole } from '@/src/hooks/useApi';
import { useBoardSocket } from '@/src/hooks/useBoardSocket';
import { getApiErrorMessage } from '@/src/lib/axios';
import type { Note } from '@/src/lib/types';
import { throttle } from '@/src/lib/utils';
import { useBoardStore } from '@/src/store/boardStore';
import { useCanvasStore } from '@/src/store/canvasStore';

export default function BoardPage() {
  const params = useParams<{ id: string }>();
  const boardId = params.id;
  const { user } = useAuth();
  const { data: board } = useBoard(boardId);
  const role = useRole(board, user?.id);
  const { data: fetchedNotes, dataUpdatedAt: notesUpdatedAt, createNote, updatePosition, updateNote, deleteNote } = useNotes(boardId);
  const socket = useBoardSocket(boardId);
  const notes = useBoardStore((state) => state.notes);
  const setBoard = useBoardStore((state) => state.setBoard);
  const setNotes = useBoardStore((state) => state.setNotes);
  const activeUsers = useBoardStore((state) => state.activeUsers);
  const patchNote = useBoardStore((state) => state.patchNote);
  const rememberPending = useBoardStore((state) => state.rememberPending);
  const rollbackPending = useBoardStore((state) => state.rollbackPending);
  const clearPending = useBoardStore((state) => state.clearPending);
  const conflict = useBoardStore((state) => state.conflict);
  const setConflict = useBoardStore((state) => state.setConflict);
  const realtimeStatus = useBoardStore((state) => state.realtimeStatus);
  const realtimeError = useBoardStore((state) => state.realtimeError);
  const { scale, offsetX, offsetY, setScale, setOffset, resetView } = useCanvasStore();
  const [panning, setPanning] = useState(false);
  const [historyNoteId, setHistoryNoteId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [noteSearch, setNoteSearch] = useState('');
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const latestScale = useRef(scale);

  latestScale.current = scale;

  const noteList = useMemo(
    () => Object.values(notes).sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || a.zIndex - b.zIndex),
    [notes],
  );
  const visibleNotes = useMemo(() => {
    const query = noteSearch.trim().toLowerCase();
    if (!query) return noteList;
    return noteList.filter((note) => `${note.title ?? ''} ${note.content ?? ''}`.toLowerCase().includes(query));
  }, [noteList, noteSearch]);

  useEffect(() => {
    if (board) setBoard(board);
  }, [board, setBoard]);

  useEffect(() => {
    if (fetchedNotes) setNotes(fetchedNotes);
  }, [notesUpdatedAt, fetchedNotes, setNotes]);

  useEffect(() => {
    if (!socket) return;
    const id = setInterval(() => socket.emit('heartbeat', { boardId }), 15000);
    return () => clearInterval(id);
  }, [socket, boardId]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setScale(latestScale.current + (event.deltaY > 0 ? -0.08 : 0.08));
    };

    surface.addEventListener('wheel', handleWheel, { passive: false });
    return () => surface.removeEventListener('wheel', handleWheel);
  }, [setScale]);

  const sendCursor = useMemo(
    () => throttle((cursorX: number, cursorY: number) => socket?.emit('cursor_move', { boardId, cursorX, cursorY }), 50),
    [socket, boardId],
  );
  const editable = role === 'owner' || role === 'editor';
  const clampPosition = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);

  const addNote = () =>
    createNote.mutate({
      title: 'New note',
      content: '',
      color: '#fef3c7',
      positionX: clampPosition((120 - offsetX) / scale),
      positionY: clampPosition((120 - offsetY) / scale),
      width: 280,
      height: 180,
      zIndex: noteList.length + 1,
    });

  const updateViaSocket = (note: Note, patch: Partial<Note>) => {
    setSaveError(null);
    rememberPending(note);
    patchNote(note.id, { ...patch, version: note.version + 1 });
    if (socket?.connected) {
      socket.emit('note_update', { boardId, noteId: note.id, currentVersion: note.version, ...patch });
      return;
    }
    updateNote.mutate(
      { id: note.id, current_version: note.version, ...patch },
      {
        onSuccess: (saved) => {
          patchNote(saved.id, saved);
          clearPending(saved.id);
        },
        onError: (error) => {
          rollbackPending(note.id);
          setSaveError(getApiErrorMessage(error, 'Could not save note.'));
        },
      },
    );
  };
  const handleTyping = useCallback(
    (noteId: string, isTyping: boolean) => {
      if (socket?.connected) {
        socket.emit(isTyping ? 'typing_start' : 'typing_stop', { boardId, noteId });
      }
    },
    [socket, boardId],
  );

  const handlePositionError = (moved: Note, error: unknown) => {
    const response = (error as { response?: { status?: number; data?: any } }).response;
    const conflictBody = response?.data?.message ?? response?.data;
    if (response?.status === 409 && conflictBody?.current_note) {
      patchNote(moved.id, conflictBody.current_note);
      clearPending(moved.id);
      setSaveError('That note moved elsewhere. Synced to the latest version.');
      return;
    }
    rollbackPending(moved.id);
    setSaveError(getApiErrorMessage(error, 'Could not save note position.'));
  };

  const moveNote = (moved: Note, x: number, y: number) => {
    if (!editable) return;
    const nextX = clampPosition(x);
    const nextY = clampPosition(y);
    if (nextX === moved.positionX && nextY === moved.positionY) return;
    if (moved.positionX > 80 && moved.positionY > 80 && nextX === 0 && nextY === 0) {
      setSaveError('Ignored an invalid drag position. Try dragging from the note handle again.');
      return;
    }
    setSaveError(null);
    rememberPending(moved);
    patchNote(moved.id, { positionX: nextX, positionY: nextY, version: moved.version + 1 });

    if (socket?.connected) {
      socket.emit('note_update', {
        boardId,
        noteId: moved.id,
        currentVersion: moved.version,
        positionX: nextX,
        positionY: nextY,
        zIndex: moved.zIndex,
      });
      return;
    }

    updatePosition.mutate(
      { id: moved.id, current_version: moved.version, positionX: nextX, positionY: nextY, zIndex: moved.zIndex },
      {
        onError: (error) => handlePositionError(moved, error),
        onSuccess: (saved) => {
          patchNote(saved.id, saved);
          clearPending(moved.id);
        },
      },
    );
  };

  return (
    <main className="h-screen overflow-hidden bg-board">
      <div
        ref={surfaceRef}
        className="relative h-full cursor-default bg-dot-grid canvas-surface"
        onMouseDown={(e) => {
          if (e.button === 1 || e.shiftKey) {
            setPanning(true);
            panStart.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
          }
        }}
        onMouseUp={() => setPanning(false)}
        onMouseLeave={() => setPanning(false)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left - offsetX) / scale;
          const y = (e.clientY - rect.top - offsetY) / scale;
          sendCursor(x, y);
          if (panning) {
            setOffset(panStart.current.ox + e.clientX - panStart.current.x, panStart.current.oy + e.clientY - panStart.current.y);
          }
        }}
      >
        <BoardToolbar
          board={board}
          role={role}
          activeUsers={activeUsers}
          onAdd={addNote}
          onZoomIn={() => setScale(scale + 0.1)}
          onZoomOut={() => setScale(scale - 0.1)}
          onReset={resetView}
          search={noteSearch}
          onSearchChange={setNoteSearch}
          searchResultCount={visibleNotes.length}
          realtimeStatus={realtimeStatus}
        />
        <div className="absolute left-0 top-0 h-full w-full origin-top-left" style={{ transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})` }}>
          {visibleNotes.map((note) => (
            <StickyNoteCard
              key={note.id}
              note={note}
              role={role}
              onSocketUpdate={updateViaSocket}
              onTyping={handleTyping}
              onDelete={(id) => {
                if (!editable) return;
                setSaveError(null);
                deleteNote.mutate(id, {
                  onError: (error) => setSaveError(getApiErrorMessage(error, 'Could not delete note. Your note was restored.')),
                });
              }}
              onHistory={setHistoryNoteId}
              onMove={moveNote}
            />
          ))}
        </div>
        {activeUsers
          .filter((active) => active.userId !== user?.id && active.cursorX !== undefined)
          .map((active) => (
            <div
              key={active.userId}
              className="pointer-events-none absolute z-40"
              style={{ transform: `translate(${offsetX + Number(active.cursorX) * scale}px, ${offsetY + Number(active.cursorY) * scale}px)` }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill={active.avatarColor}>
                <path d="M3 2l17 10-7 2-3 7L3 2z" />
              </svg>
              <span className="rounded bg-white px-2 py-1 text-xs font-semibold shadow">{active.username}</span>
            </div>
          ))}
        {historyNoteId && <NoteHistoryModal boardId={boardId} noteId={historyNoteId} onClose={() => setHistoryNoteId(null)} />}
        <ConflictToast
          onUseTheirs={() => {
            if (conflict) {
              patchNote(conflict.noteId, conflict.currentNote);
              clearPending(conflict.noteId);
            }
            setConflict(null);
          }}
          onKeepMine={() => {
            if (conflict) {
              const attemptedPatch = conflict.attemptedPatch ?? {
                title: notes[conflict.noteId]?.title,
                content: notes[conflict.noteId]?.content,
              };
              rememberPending(conflict.currentNote);
              patchNote(conflict.noteId, {
                ...conflict.currentNote,
                ...attemptedPatch,
                version: conflict.currentVersion + 1,
              });
              socket?.emit('note_update', {
                boardId,
                noteId: conflict.noteId,
                currentVersion: conflict.currentVersion,
                ...attemptedPatch,
              });
            }
            setConflict(null);
          }}
        />
        {(saveError || realtimeError) && <div className="absolute bottom-16 left-4 z-50 rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-700 shadow">{saveError ?? realtimeError}</div>}
        <div className="absolute bottom-4 left-4 rounded-md bg-white px-3 py-2 text-sm text-muted shadow sm:hidden">Canvas editing works best on desktop.</div>
      </div>
    </main>
  );
}







