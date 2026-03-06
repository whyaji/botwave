import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { api } from '@/lib/api';
import { getToken } from '@/stores/auth';

export const Route = createFileRoute('/_dashboard/jobs')({
  component: JobsPage,
});

type Job = {
  id: number;
  type: string;
  payload: unknown;
  status: string;
  result: unknown;
  lastError: string | null;
  createdAt: string;
  completedAt: string | null;
};

type PaginationMeta = { page: number; limit: number; total: number; totalPages: number };

const DEFAULT_META: PaginationMeta = { page: 1, limit: 10, total: 0, totalPages: 0 };

function JobsPage() {
  const token = getToken();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', page, limit],
    queryFn: async () => {
      const res = await api<Job[]>(`/jobs?page=${page}&limit=${limit}`, {
        token: token ?? undefined,
      });
      const list = Array.isArray(res.data) ? res.data : [];
      const meta = (res.meta as PaginationMeta | undefined) ?? DEFAULT_META;
      return { list, meta };
    },
  });

  const list = data?.list ?? [];
  const meta = data?.meta ?? DEFAULT_META;
  const { total, totalPages } = meta;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div>
      <h1 className="display-title mb-4 text-2xl font-bold text-[var(--sea-ink)]">Jobs</h1>
      <div className="island-shell rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface)]">
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">ID</th>
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">Type</th>
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">Status</th>
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">Created</th>
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">Error</th>
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
              list.map((job) => (
                <tr key={job.id} className="border-b border-[var(--line)]">
                  <td className="p-3 font-mono text-xs">{job.id}</td>
                  <td className="p-3">{job.type}</td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        job.status === 'Completed'
                          ? 'bg-green-100 text-green-800'
                          : job.status === 'Failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-700'
                      }`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="p-3 text-[var(--sea-ink-soft)]">
                    {new Date(job.createdAt).toLocaleString()}
                  </td>
                  <td className="max-w-xs truncate p-3 text-xs text-red-600">
                    {job.lastError ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && totalPages > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-sm text-[var(--sea-ink-soft)]">
            <span>
              Showing {from}–{to} of {total}
            </span>
            <label className="flex items-center gap-2">
              <span>Per page</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-[var(--sea-ink)]">
                {[10, 20, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--sea-ink)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--foam)]">
              Previous
            </button>
            <span className="min-w-[6rem] text-center text-sm text-[var(--sea-ink-soft)]">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--sea-ink)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--foam)]">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
