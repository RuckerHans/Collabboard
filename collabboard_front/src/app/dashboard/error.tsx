'use client';
export default function Error({ reset }: { reset: () => void }) {
  return <div className="grid min-h-screen place-items-center"><button onClick={reset} className="rounded-md bg-brand-600 px-4 py-2 font-semibold text-white">Try again</button></div>;
}
