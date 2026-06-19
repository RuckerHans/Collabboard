'use client';

import { X } from 'lucide-react';
import { useNoteHistory } from '@/src/hooks/useApi';

export function NoteHistoryModal({ boardId, noteId, onClose }: { boardId: string; noteId: string; onClose: () => void }) {
  const { data = [], isLoading } = useNoteHistory(boardId, noteId);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"><section className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-6 shadow-panel"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Note history</h2><button onClick={onClose}><X size={18} /></button></div>{isLoading ? <p className="mt-6 text-muted">Loading history...</p> : data.length === 0 ? <p className="mt-6 text-muted">No history entries.</p> : <div className="mt-6 space-y-4">{data.map((entry) => <article key={entry.id} className="rounded-md border border-line p-4"><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold">{entry.operation}</span><span className="text-sm text-muted">v{entry.versionBefore ?? '-'} to v{entry.versionAfter ?? '-'}</span><span className="text-sm text-muted">by {entry.changedBy}</span></div><p className="mt-2 text-sm">Changed: {entry.changedFields?.join(', ') || 'unknown fields'}</p><div className="mt-3 grid gap-3 md:grid-cols-2"><pre className="overflow-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify(entry.beforeSnapshot ?? {}, null, 2)}</pre><pre className="overflow-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify(entry.afterSnapshot ?? {}, null, 2)}</pre></div></article>)}</div>}</section></div>;
}
