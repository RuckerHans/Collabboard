import Link from 'next/link';
import { ArrowRight, LayoutDashboard, MousePointer2, StickyNote, Users } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6">
        <nav className="flex items-center justify-between">
          <Link href="/" className="text-xl font-semibold tracking-tight">Collabboard</Link>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Log in</Link>
            <Link href="/register" className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">Sign up</Link>
          </div>
        </nav>
        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-line px-3 py-1 text-sm font-medium text-muted">Shared boards, live notes, calmer planning</p>
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl">Collabboard</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">A real-time sticky-note workspace for teams that need lightweight planning, visible presence, and fast idea capture.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700">Create workspace <ArrowRight size={18} /></Link>
              <Link href="/login" className="rounded-md border border-line px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">Open dashboard</Link>
            </div>
          </div>
          <div className="relative min-h-[420px] overflow-hidden rounded-lg border border-line bg-board bg-dot-grid shadow-panel">
            {[['Ideas', 'Map onboarding flow', '#fef3c7', 'left-8 top-10'], ['Next', 'Invite beta users', '#dbeafe', 'right-12 top-20'], ['Blocked', 'Resolve copy conflicts', '#fee2e2', 'left-24 bottom-16']].map(([title, text, color, pos]) => (
              <div key={title} className={`absolute ${pos} w-56 rounded-md p-4 shadow-note`} style={{ background: color }}>
                <div className="font-semibold">{title}</div><p className="mt-2 text-sm text-slate-700">{text}</p>
              </div>
            ))}
            <div className="absolute bottom-5 right-5 flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm shadow"><Users size={16} /> 4 online</div>
          </div>
        </div>
        <div className="grid gap-3 pb-8 sm:grid-cols-3">
          {[['Boards', LayoutDashboard], ['Sticky notes', StickyNote], ['Live cursors', MousePointer2]].map(([label, Icon]) => <div key={String(label)} className="flex items-center gap-3 rounded-md border border-line p-4 text-sm font-medium"><Icon size={18} />{String(label)}</div>)}
        </div>
      </section>
    </main>
  );
}
