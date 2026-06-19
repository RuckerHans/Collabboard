'use client';

import { ArrowLeft, Plus, RotateCcw, Settings, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import Link from 'next/link';
import type { ActiveUser, Board, BoardRole } from '@/src/lib/types';
import { initials } from '@/src/lib/utils';

type Props = {
  board?: Board | null;
  role?: BoardRole;
  activeUsers: ActiveUser[];
  onAdd: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
};

export function BoardToolbar({ board, role, activeUsers, onAdd, onZoomIn, onZoomOut, onReset }: Props) {
  const editable = role === 'owner' || role === 'editor';
  return (
    <div className="absolute left-4 right-4 top-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className="rounded-md p-2 hover:bg-slate-100">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-base font-semibold">{board?.name ?? 'Board'}</h1>
          <p className="text-xs text-muted">Role: {role ?? 'viewer'}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {editable && (
          <button onClick={onAdd} className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white">
            <Plus size={16} /> Add
          </button>
        )}
        <button onClick={onZoomOut} className="rounded-md p-2 hover:bg-slate-100"><ZoomOut size={18} /></button>
        <button onClick={onZoomIn} className="rounded-md p-2 hover:bg-slate-100"><ZoomIn size={18} /></button>
        <button onClick={onReset} className="rounded-md p-2 hover:bg-slate-100"><RotateCcw size={18} /></button>
        <div className="mx-2 flex -space-x-2">
          {activeUsers.slice(0, 6).map((user, index) => (
            <span
              key={user.userId || `${user.username}-${index}`}
              title={user.username}
              className="grid h-8 w-8 place-items-center rounded-full border-2 border-white text-xs font-bold text-white"
              style={{ background: user.avatarColor || '#64748b' }}
            >
              {initials(user.username)}
            </span>
          ))}
        </div>
        <Link href={`/boards/${board?.id}/trash`} className="rounded-md p-2 hover:bg-slate-100"><Trash2 size={18} /></Link>
        <Link href={`/boards/${board?.id}/settings`} className="rounded-md p-2 hover:bg-slate-100"><Settings size={18} /></Link>
      </div>
    </div>
  );
}
