import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_dashboard/')({
  component: DashboardHome,
});

function DashboardHome() {
  return (
    <div>
      <h1 className="display-title mb-4 text-2xl font-bold text-[var(--sea-ink)]">Dashboard</h1>
      <p className="text-[var(--sea-ink-soft)]">
        Use the sidebar to manage instances, apps, users, and view jobs.
      </p>
    </div>
  );
}
