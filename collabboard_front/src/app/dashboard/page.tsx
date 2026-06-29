'use client';

import { LayoutGrid, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { useBoards } from '@/src/hooks/useApi';
import { getApiErrorMessage } from '@/src/lib/axios';
import { formatActivity } from '@/src/lib/utils';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const { data: boards = [], isLoading, error, createBoard } = useBoards();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const filteredBoards = useMemo(() => {
    if (!deferredSearch) return boards;
    return boards.filter((board) =>
      `${board.name} ${board.description ?? ''}`.toLowerCase().includes(deferredSearch),
    );
  }, [boards, deferredSearch]);

  return (
    <main className="min-h-screen bg-slate-50 text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 text-xl font-semibold">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white"><LayoutGrid size={18} /></span>
            Collabboard
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{user?.username}</span>
            <button onClick={logout} className="rounded-md border border-line px-3 py-2 transition hover:bg-slate-50">Log out</button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Workspace</p>
            <h1 className="mt-1 text-3xl font-semibold">Your boards</h1>
            <p className="mt-1 text-muted">Find a board or start something new with your team.</p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            <Plus size={18} /> New board
          </button>
        </div>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search boards by name or description"
              aria-label="Search boards"
              className="w-full rounded-lg border border-line bg-white py-2.5 pl-10 pr-10 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear board search"
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {!isLoading && (
            <p className="text-sm text-muted" aria-live="polite">
              {deferredSearch ? `${filteredBoards.length} of ${boards.length} boards` : `${boards.length} ${boards.length === 1 ? 'board' : 'boards'}`}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {getApiErrorMessage(error, 'Boards could not be loaded.')}
          </p>
        )}

        {isLoading ? (
          <BoardGridSkeleton />
        ) : boards.length === 0 ? (
          <EmptyState onCreate={() => setOpen(true)} />
        ) : filteredBoards.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Search className="mx-auto text-muted" size={28} />
            <h2 className="mt-3 text-lg font-semibold">No matching boards</h2>
            <p className="mt-1 text-sm text-muted">Try another name or clear your search.</p>
            <button onClick={() => setSearch('')} className="mt-4 font-semibold text-brand-600">Clear search</button>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBoards.map((board) => (
              <Link
                key={board.id}
                href={`/boards/${board.id}`}
                className="group rounded-xl border border-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-panel focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold group-hover:text-brand-600">{board.name}</h2>
                  {board.ownerId === user?.id && <span className="rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">Owner</span>}
                </div>
                <p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted">{board.description || 'No description yet'}</p>
                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
                  <span>{board.memberCount ?? 1} {(board.memberCount ?? 1) === 1 ? 'member' : 'members'}</span>
                  <span className="text-muted">{formatActivity(board.lastActivity)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {open && (
        <CreateBoardModal
          onClose={() => { createBoard.reset(); setOpen(false); }}
          onCreate={(values) => createBoard.mutate(values, { onSuccess: () => setOpen(false) })}
          pending={createBoard.isPending}
          error={createBoard.error}
        />
      )}
    </main>
  );
}

function BoardGridSkeleton() {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading boards">
      {[0, 1, 2].map((item) => (
        <div key={item} className="animate-pulse rounded-xl border border-line bg-white p-5">
          <div className="h-5 w-2/3 rounded bg-slate-200" />
          <div className="mt-4 h-4 rounded bg-slate-100" />
          <div className="mt-2 h-4 w-4/5 rounded bg-slate-100" />
          <div className="mt-6 h-4 w-1/2 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mt-10 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <div className="mx-auto mb-4 h-24 w-32 rounded-lg bg-dot-grid" />
      <h2 className="text-xl font-semibold">No boards yet</h2>
      <p className="mt-2 text-muted">Create your first shared sticky-note board.</p>
      <button onClick={onCreate} className="mt-5 rounded-md bg-brand-600 px-4 py-2 font-semibold text-white">Create board</button>
    </div>
  );
}

function CreateBoardModal({ onClose, onCreate, pending, error }: { onClose: () => void; onCreate: (values: { name: string; description?: string }) => void; pending: boolean; error: unknown }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="create-board-title">
      <form onSubmit={(event) => { event.preventDefault(); onCreate({ name: name.trim(), description: description.trim() || undefined }); }} className="w-full max-w-md rounded-xl bg-white p-6 shadow-panel">
        <h2 id="create-board-title" className="text-xl font-semibold">Create board</h2>
        <p className="mt-1 text-sm text-muted">Give your team a clear place to collaborate.</p>
        {Boolean(error) && <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{getApiErrorMessage(error, 'The board could not be created.')}</p>}
        <label className="mt-5 block text-sm font-medium">Name
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="Product roadmap" className="mt-2 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
        </label>
        <label className="mt-4 block text-sm font-medium">Description <span className="font-normal text-muted">(optional)</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} placeholder="What will your team use this board for?" className="mt-2 h-24 w-full resize-none rounded-md border border-line px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-line px-4 py-2 transition hover:bg-slate-50">Cancel</button>
          <button disabled={pending || !name.trim()} className="rounded-md bg-brand-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{pending ? 'Creating...' : 'Create board'}</button>
        </div>
      </form>
    </div>
  );
}
