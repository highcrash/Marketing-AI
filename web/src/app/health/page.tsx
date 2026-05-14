import { AppHeader } from '@/components/AppHeader';
import { HealthView } from '@/components/HealthView';

export const dynamic = 'force-dynamic';

export default function HealthPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-medium">
            System
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Health</h1>
          <p className="text-sm text-muted-foreground">
            DB · Restora · Claude · Facebook · backups · service logs.
          </p>
        </div>
        <HealthView />
      </main>
    </div>
  );
}
