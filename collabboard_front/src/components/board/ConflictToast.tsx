'use client';

import { X } from 'lucide-react';
import { useBoardStore } from '@/src/store/boardStore';

export function ConflictToast({ onKeepMine, onUseTheirs }: { onKeepMine: () => void; onUseTheirs: () => void }) {
  const conflict = useBoardStore((state) => state.conflict);
  const setConflict = useBoardStore((state) => state.setConflict);
  if (!conflict) return null;
  return <div className="fixed bottom-5 right-5 z-50 w-80 rounded-lg border border-amber-300 bg-white p-4 shadow-panel"><div className="flex items-start justify-between"><div><h3 className="font-semibold">Note conflict</h3><p className="mt-1 text-sm text-muted">Server has version {conflict.currentVersion}. Choose how to continue.</p></div><button onClick={() => setConflict(null)}><X size={16} /></button></div><div className="mt-4 flex gap-2"><button onClick={onUseTheirs} className="rounded-md border border-line px-3 py-2 text-sm font-semibold">Use theirs</button><button onClick={onKeepMine} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white">Keep mine</button></div></div>;
}
