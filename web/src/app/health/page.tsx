import Link from 'next/link';
import { HealthView } from '@/components/HealthView';

export const dynamic = 'force-dynamic';

export default function HealthPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-50">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-red-600 font-medium mb-1">
              Marketing AI
            </p>
            <h1 className="text-2xl font-semibold">Health</h1>
            <p className="text-xs text-zinc-500 mt-1">
              What&apos;s working and what&apos;s broken — DB, Restora, Claude, every Facebook connection.
            </p>
          </div>
          <Link
            href="/"
            className="text-xs text-zinc-500 hover:text-red-600 tracking-widest uppercase"
          >
            ← Back to dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <HealthView />
      </div>
    </main>
  );
}
