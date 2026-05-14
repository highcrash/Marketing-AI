import { AppHeader } from '@/components/AppHeader';
import { SchedulesView } from '@/components/SchedulesView';

export const dynamic = 'force-dynamic';

export default function SchedulesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-medium">
            Calendar
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Schedules</h1>
          <p className="text-sm text-muted-foreground">
            Every scheduled send across all your audits, in one place.
          </p>
        </div>
        <SchedulesView />
      </main>
    </div>
  );
}
