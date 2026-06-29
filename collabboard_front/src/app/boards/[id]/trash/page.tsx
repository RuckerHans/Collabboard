'use client';

import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useNotes } from '@/src/hooks/useApi';
import { getApiErrorMessage } from '@/src/lib/axios';
import { useBoardStore } from '@/src/store/boardStore';

export default function TrashPage() {
  const { id } = useParams<{ id: string }>();
  const { restoreNote } = useNotes(id);
  const deletedNotes = useBoardStore((state) => state.deletedNotes);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link href={`/boards/${id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700">
          <ArrowLeft size={16} /> Back to board
        </Link>
        <div className="mt-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-200 text-muted"><Trash2 size={21} /></span>
          <div>
            <h1 className="text-3xl font-semibold">Trash</h1>
            <p className="text-sm text-muted">{deletedNotes.length} {deletedNotes.length === 1 ? 'note' : 'notes'} deleted this session</p>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm text-muted">Restore a note and it will reappear on the board immediately—no page refresh required.</p>

        {restoreError && <p role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{restoreError}</p>}

        {deletedNotes.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-line bg-white p-10 text-center">
            <Trash2 className="mx-auto text-slate-300" size={30} />
            <h2 className="mt-3 font-semibold">Trash is empty</h2>
            <p className="mt-1 text-sm text-muted">Deleted notes from this session will appear here.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            {deletedNotes.map((note) => (
              <article key={note.id} className="flex flex-col gap-4 rounded-xl border border-line bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{note.title || 'Untitled note'}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{note.content || 'No content'}</p>
                </div>
                <button
                  disabled={restoreNote.isPending}
                  onClick={() => {
                    setRestoreError(null);
                    restoreNote.mutate(note.id, {
                      onError: (error) => setRestoreError(getApiErrorMessage(error, 'Could not restore note.')),
                    });
                  }}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <RotateCcw size={15} /> Restore
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
