'use client';

import { motion } from 'framer-motion';
import { Check, Grip, Pin, Trash2, X } from 'lucide-react';
import { PointerEvent, useEffect, useRef, useState } from 'react';
import type { BoardRole, Note } from '@/src/lib/types';
import { useBoardStore } from '@/src/store/boardStore';
import { useCanvasStore } from '@/src/store/canvasStore';

const colors = ['#fef3c7', '#dcfce7', '#dbeafe', '#fce7f3', '#ede9fe', '#fee2e2'];
const DRAG_THRESHOLD_PX = 4;
const clampPosition = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);

type Props = {
  note: Note;
  role?: BoardRole;
  onMove: (note: Note, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onSocketUpdate: (note: Note, patch: Partial<Note>) => void;
  onTyping: (noteId: string, isTyping: boolean) => void;
  onHistory: (id: string) => void;
};

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

export function StickyNoteCard({ note, role, onMove, onDelete, onSocketUpdate, onTyping, onHistory }: Props) {
  const editable = role === 'owner' || role === 'editor';
  const scale = useCanvasStore((state) => state.scale);
  const activeUsers = useBoardStore((state) => state.activeUsers);
  const typing = activeUsers.find((user) => user.currentNoteId === note.id && user.isTyping);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draftPosition, setDraftPosition] = useState<{ x: number; y: number } | null>(null);
  const [title, setTitle] = useState(note.title ?? '');
  const [content, setContent] = useState(note.content ?? '');
  const drag = useRef<DragState | null>(null);

  useEffect(() => {
    setTitle(note.title ?? '');
    setContent(note.content ?? '');
  }, [note.title, note.content]);

  useEffect(() => {
    if (!editing) return;
    onTyping(note.id, true);
    return () => onTyping(note.id, false);
  }, [editing, note.id, onTyping]);

  const save = () => {
    onSocketUpdate(note, { title, content });
    setEditing(false);
  };

  const canDrag = editable && !note.isPinned && !editing;
  const visualX = draftPosition?.x ?? clampPosition(note.positionX);
  const visualY = draftPosition?.y ?? clampPosition(note.positionY);

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!canDrag || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = clampPosition(note.positionX);
    const startY = clampPosition(note.positionY);
    drag.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX,
      startY,
      moved: false,
    };
    setDraftPosition({ x: startX, y: startY });
    setDragging(true);
  };

  const continueDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = event.clientX - current.startClientX;
    const deltaY = event.clientY - current.startClientY;
    if (!current.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;
    current.moved = true;
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    setDraftPosition({
      x: clampPosition(current.startX + deltaX / safeScale),
      y: clampPosition(current.startY + deltaY / safeScale),
    });
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    const deltaX = event.clientX - current.startClientX;
    const deltaY = event.clientY - current.startClientY;
    const movedEnough = current.moved || Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX;
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const nextX = clampPosition(current.startX + deltaX / safeScale);
    const nextY = clampPosition(current.startY + deltaY / safeScale);
    drag.current = null;
    setDragging(false);
    setDraftPosition(null);
    if (!movedEnough) return;
    if (nextX === current.startX && nextY === current.startY) return;
    onMove(note, nextX, nextY);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: dragging ? 1.02 : 1 }}
      transition={{ duration: 0.12 }}
      className="absolute rounded-md p-3 shadow-note will-change-transform"
      style={{
        left: visualX,
        top: visualY,
        width: note.width,
        minHeight: note.height,
        background: note.color ?? '#fef3c7',
        zIndex: dragging ? 9999 : note.zIndex,
      }}
      onDoubleClick={() => editable && setEditing(true)}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onPointerDown={startDrag}
          onPointerMove={continueDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          className="touch-none rounded p-1 text-slate-500 hover:bg-white/50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canDrag}
          aria-label="Drag note"
        >
          <Grip size={16} />
        </button>
        {note.isPinned && <Pin size={15} className="text-slate-700" />}
        <div className="ml-auto flex gap-1">
          {editable && editing && (
            <button type="button" onClick={save} className="rounded p-1 hover:bg-white/50">
              <Check size={16} />
            </button>
          )}
          {editable && editing && (
            <button type="button" onClick={() => setEditing(false)} className="rounded p-1 hover:bg-white/50">
              <X size={16} />
            </button>
          )}
          <button type="button" onClick={() => onHistory(note.id)} className="rounded px-2 py-1 text-xs font-semibold hover:bg-white/50">
            History
          </button>
          {editable && (
            <button type="button" onClick={() => onDelete(note.id)} className="rounded p-1 hover:bg-white/50">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-transparent text-base font-semibold outline-none" placeholder="Title" />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} className="note-textarea mt-2 min-h-24 w-full resize-none bg-transparent text-sm outline-none" placeholder="Write something" />
        </>
      ) : (
        <>
          <h3 className="break-words font-semibold">{note.title || 'Untitled'}</h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">{note.content}</p>
        </>
      )}
      {editable && (
        <div className="mt-3 flex items-center gap-1">
          {colors.map((color) => (
            <button key={color} type="button" onClick={() => onSocketUpdate(note, { color })} className="h-5 w-5 rounded-full border border-slate-400" style={{ background: color }} />
          ))}
          <button type="button" onClick={() => onSocketUpdate(note, { isPinned: !note.isPinned })} className="ml-auto rounded p-1 hover:bg-white/50">
            <Pin size={15} />
          </button>
        </div>
      )}
      {typing && <div className="mt-2 text-xs font-medium text-slate-600">{typing.username} is typing...</div>}
    </motion.div>
  );
}
