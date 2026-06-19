'use client';

import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { useBoards } from '@/src/hooks/useApi';
import { formatActivity } from '@/src/lib/utils';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const { data: boards = [], isLoading, createBoard } = useBoards();
  const [open, setOpen] = useState(false);
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-xl font-semibold">Collabboard</Link>
          <div className="flex items-center gap-3 text-sm"><span className="text-muted">{user?.username}</span><button onClick={logout} className="rounded-md border border-line px-3 py-2">Log out</button></div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between"><div><h1 className="text-3xl font-semibold">Boards</h1><p className="mt-1 text-muted">Pick up where your team left off.</p></div><button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 font-semibold text-white"><Plus size={18} /> New board</button></div>
        {isLoading ? <p className="mt-8 text-muted">Loading boards...</p> : boards.length === 0 ? <EmptyState onCreate={() => setOpen(true)} /> : <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{boards.map((board) => <Link key={board.id} href={`/boards/${board.id}`} className="rounded-lg border border-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-panel"><div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">{board.name}</h2>{board.ownerId === user?.id && <Trash2 size={16} className="text-muted" />}</div><p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted">{board.description || 'No description'}</p><div className="mt-5 flex items-center justify-between text-sm"><span>{board.memberCount ?? 1} members</span><span className="text-muted">{formatActivity(board.lastActivity)}</span></div></Link>)}</div>}
      </section>
      {open && <CreateBoardModal onClose={() => setOpen(false)} onCreate={(values) => createBoard.mutate(values, { onSuccess: () => setOpen(false) })} pending={createBoard.isPending} />}
    </main>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return <div className="mt-10 rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center"><div className="mx-auto mb-4 h-24 w-32 rounded-lg bg-dot-grid" /><h2 className="text-xl font-semibold">No boards yet</h2><p className="mt-2 text-muted">Create your first shared sticky-note board.</p><button onClick={onCreate} className="mt-5 rounded-md bg-brand-600 px-4 py-2 font-semibold text-white">Create board</button></div>;
}

function CreateBoardModal({ onClose, onCreate, pending }: { onClose: () => void; onCreate: (values: { name: string; description?: string }) => void; pending: boolean }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"><form onSubmit={(event) => { event.preventDefault(); onCreate({ name, description: description || undefined }); }} className="w-full max-w-md rounded-lg bg-white p-6 shadow-panel"><h2 className="text-xl font-semibold">Create board</h2><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="Board name" className="mt-5 w-full rounded-md border border-line px-3 py-2" /><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="mt-3 h-24 w-full rounded-md border border-line px-3 py-2" /><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-md border border-line px-4 py-2">Cancel</button><button disabled={pending} className="rounded-md bg-brand-600 px-4 py-2 font-semibold text-white">Create</button></div></form></div>;
}
