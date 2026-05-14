import { AppHeader } from '@/components/AppHeader';
import { CompletionsView } from '@/components/CompletionsView';

export const dynamic = 'force-dynamic';

export default function CompletionsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-medium">
            Audit trail
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Completions</h1>
          <p className="text-sm text-muted-foreground">
            Every piece marked done — through the platform or externally with a note.
          </p>
        </div>
        <CompletionsView />
      </main>
    </div>
  );
}
