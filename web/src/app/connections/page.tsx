import { AppHeader } from '@/components/AppHeader';
import { ConnectionsView } from '@/components/ConnectionsView';

export const dynamic = 'force-dynamic';

export default function ConnectionsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-medium">
            Platforms
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Connections</h1>
          <p className="text-sm text-muted-foreground">
            External platforms the audit can post to on your behalf.
          </p>
        </div>
        <ConnectionsView />
      </main>
    </div>
  );
}
