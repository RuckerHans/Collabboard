'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useNotes } from '@/src/hooks/useApi';
import { useBoardStore } from '@/src/store/boardStore';

export default function TrashPage() {
  const { id } = useParams<{ id: string }>();
  const { restoreNote } = useNotes(id);
  const deletedNotes = useBoardStore((state) => state.deletedNotes);
  return <main className="min-h-screen bg-slate-50 px-6 py-8"><div className="mx-auto max-w-4xl"><Link href={`/boards/${id}`} className="text-sm font-semibold text-brand-600">Back to board</Link><h1 className="mt-4 text-3xl font-semibold">Trash</h1><p className="mt-2 text-muted">The backend exposes restore but not a deleted-note listing or hard-delete endpoint, so this page shows notes deleted during the current session.</p>{deletedNotes.length === 0 ? <div className="mt-8 rounded-lg border border-dashed border-line bg-white p-10 text-center text-muted">Trash is empty.</div> : <div className="mt-6 grid gap-3">{deletedNotes.map((note) => <div key={note.id} className="rounded-lg border border-line bg-white p-4"><h2 className="font-semibold">{note.title || 'Untitled'}</h2><p className="mt-1 text-sm text-muted">{note.content}</p><button onClick={() => restoreNote.mutate(note.id)} className="mt-3 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white">Restore</button></div>)}</div>}</div></main>;
}
