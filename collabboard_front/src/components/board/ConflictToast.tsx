'use client';

import { X } from 'lucide-react';
import { useBoardStore } from '@/src/store/boardStore';

export function ConflictToast({ onKeepMine, onUseTheirs }: { onKeepMine: () => void; onUseTheirs: () => void }) {
  const conflict = useBoardStore((state) => state.conflict);
  const setConflict = useBoardStore((state) => state.setConflict);
  if (!conflict) return null;
  return <div className="fixed bottom-5 right-5 z-50 w-80 rounded-xl border border-amber-200 bg-white p-4 shadow-panel"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Both of you edited this note</h3><p className="mt-1 text-sm text-muted">A teammate saved the same field first. Choose the version you want to keep.</p></div><button aria-label="Dismiss conflict" className="rounded p-1 text-muted hover:bg-slate-100" onClick={() => setConflict(null)}><X size={16} /></button></div><div className="mt-4 flex gap-2"><button onClick={onUseTheirs} className="rounded-md border border-line px-3 py-2 text-sm font-semibold hover:bg-slate-50">Accept latest</button><button onClick={onKeepMine} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">Apply my changes</button></div></div>;
}
