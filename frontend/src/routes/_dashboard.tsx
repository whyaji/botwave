import { createFileRoute, Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export const Route = createFileRoute('/_dashboard')({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user, accessToken, logout } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!accessToken) {
      navigate({ to: '/login' });
      return;
    }
    api('/auth/me', { token: accessToken }).catch(() => {
      logout();
      navigate({ to: '/login' });
    });
  }, [accessToken, logout, navigate]);

  if (!accessToken) return null;

  const handleLogout = () => {
    logout();
    navigate({ to: '/login' });
  };

  return (
    <div className="flex min-h-screen bg-[var(--bg-base)]">
      <aside className="w-56 border-r border-[var(--line)] bg-[var(--header-bg)] p-4">
        <h1 className="display-title mb-6 text-lg font-bold text-[var(--sea-ink)]">BotWave</h1>
        <nav className="flex flex-col gap-1">
          <Link
            to="/"
            className="nav-link rounded-lg px-3 py-2 text-sm"
            activeOptions={{ exact: true }}>
            Dashboard
          </Link>
          <Link to="/instances" className="nav-link rounded-lg px-3 py-2 text-sm">
            Instances
          </Link>
          <Link to="/apps" className="nav-link rounded-lg px-3 py-2 text-sm">
            Apps
          </Link>
          <Link to="/users" className="nav-link rounded-lg px-3 py-2 text-sm">
            Users
          </Link>
          <Link to="/jobs" className="nav-link rounded-lg px-3 py-2 text-sm">
            Jobs
          </Link>
        </nav>
        <div className="mt-auto pt-6">
          <p className="truncate px-3 text-xs text-[var(--sea-ink-soft)]">{user?.email}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--sea-ink-soft)] hover:bg-[var(--line)]">
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
