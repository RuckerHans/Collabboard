'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { useBoard, useRole } from '@/src/hooks/useApi';
import type { BoardRole } from '@/src/lib/types';

export default function BoardSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: board, updateBoard, deleteBoard, inviteMember, changeRole, removeMember } = useBoard(id);
  const role = useRole(board, user?.id);
  const owner = role === 'owner';
  const [name, setName] = useState(board?.name ?? '');
  const [description, setDescription] = useState(board?.description ?? '');
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  return <main className="min-h-screen bg-slate-50 px-6 py-8"><div className="mx-auto max-w-4xl"><Link href={`/boards/${id}`} className="text-sm font-semibold text-brand-600">Back to board</Link><h1 className="mt-4 text-3xl font-semibold">Board settings</h1><section className="mt-6 rounded-lg border border-line bg-white p-6"><h2 className="font-semibold">Details</h2><input value={name || board?.name || ''} onChange={(e) => setName(e.target.value)} disabled={!owner} className="mt-4 w-full rounded-md border border-line px-3 py-2 disabled:bg-slate-100" /><textarea value={description || board?.description || ''} onChange={(e) => setDescription(e.target.value)} disabled={!owner} className="mt-3 h-28 w-full rounded-md border border-line px-3 py-2 disabled:bg-slate-100" /><button disabled={!owner || updateBoard.isPending} onClick={() => updateBoard.mutate({ name, description })} className="mt-3 rounded-md bg-brand-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Save changes</button></section><section className="mt-6 rounded-lg border border-line bg-white p-6"><h2 className="font-semibold">Members</h2>{owner && <form onSubmit={(e) => { e.preventDefault(); inviteMember.mutate({ email, role: inviteRole }, { onSuccess: () => setEmail('') }); }} className="mt-4 flex flex-wrap gap-2"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="min-w-64 flex-1 rounded-md border border-line px-3 py-2" /><select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')} className="rounded-md border border-line px-3 py-2"><option value="editor">Editor</option><option value="viewer">Viewer</option></select><button className="rounded-md bg-brand-600 px-4 py-2 font-semibold text-white">Invite</button></form>}<div className="mt-5 divide-y divide-line">{board?.members?.map((member) => <div key={member.userId} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><div className="font-medium">{member.username ?? member.email}</div><div className="text-sm text-muted">{member.email}</div></div><div className="flex items-center gap-2"><select disabled={!owner} value={member.role} onChange={(e) => changeRole.mutate({ userId: member.userId, role: e.target.value as BoardRole })} className="rounded-md border border-line px-2 py-1 text-sm disabled:bg-slate-100"><option value="owner">Owner</option><option value="editor">Editor</option><option value="viewer">Viewer</option></select>{(owner || member.userId === user?.id) && <button onClick={() => removeMember.mutate(member.userId)} className="rounded-md border border-line px-3 py-1 text-sm">{member.userId === user?.id && !owner ? 'Leave' : 'Remove'}</button>}</div></div>)}</div></section>{owner && <section className="mt-6 rounded-lg border border-red-200 bg-white p-6"><h2 className="font-semibold text-red-700">Danger zone</h2><button onClick={() => { if (confirm('Delete this board?')) deleteBoard.mutate(undefined, { onSuccess: () => router.push('/dashboard') }); }} className="mt-4 rounded-md bg-red-600 px-4 py-2 font-semibold text-white">Delete board</button></section>}</div></main>;
}
