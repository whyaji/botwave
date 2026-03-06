import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { api } from '@/lib/api';
import { getToken } from '@/stores/auth';

export const Route = createFileRoute('/_dashboard/users')({
  component: UsersPage,
});

type User = {
  id: number;
  email: string;
  name: string;
  role: string;
  isActive: number;
  createdAt: string;
};

function UsersPage() {
  const token = getToken();
  const { data: list, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api<User[]>('/users', { token: token ?? undefined });
      return Array.isArray(data) ? data : [];
    },
  });

  const users = Array.isArray(list) ? list : [];

  return (
    <div>
      <h1 className="display-title mb-4 text-2xl font-bold text-[var(--sea-ink)]">Users</h1>
      <div className="island-shell rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface)]">
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">Email</th>
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">Name</th>
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">Role</th>
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">Active</th>
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-[var(--sea-ink-soft)]">
                  Loading…
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--line)]">
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">{u.name}</td>
                  <td className="p-3">{u.role}</td>
                  <td className="p-3">{u.isActive ? 'Yes' : 'No'}</td>
                  <td className="p-3 text-[var(--sea-ink-soft)]">
                    {new Date(u.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
