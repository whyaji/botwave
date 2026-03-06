import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { api } from '@/lib/api';
import { getToken } from '@/stores/auth';

export const Route = createFileRoute('/_dashboard/apps')({
  component: AppsPage,
});

type App = {
  id: number;
  appId: string;
  name: string;
  description: string | null;
  instanceId: number;
  isActive: number;
};

type Instance = { id: number; name: string };

function AppsPage() {
  const queryClient = useQueryClient();
  const token = getToken();
  const [showCreate, setShowCreate] = useState(false);
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [editingApp, setEditingApp] = useState<App | null>(null);

  const { data: list = [] } = useQuery({
    queryKey: ['apps'],
    queryFn: async () => {
      const { data } = await api<App[]>('/apps', { token: token ?? undefined });
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: instances = [] } = useQuery({
    queryKey: ['instances'],
    queryFn: async () => {
      const { data } = await api<Instance[]>('/instances', { token: token ?? undefined });
      return Array.isArray(data) ? data : [];
    },
  });

  const instanceById = Object.fromEntries(instances.map((i) => [i.id, i.name]));

  const createMu = useMutation({
    mutationFn: async (body: { name: string; description?: string; instanceId: number }) => {
      const { data } = await api<App & { apiKey?: string }>('/apps', {
        method: 'POST',
        body: JSON.stringify(body),
        token: token ?? undefined,
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      if (data.apiKey) {
        setCreatedApiKey(data.apiKey);
        setShowCreate(false);
      }
    },
  });

  const updateMu = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: number;
      body: { instanceId?: number; isActive?: number };
    }) => {
      const { data } = await api<App>(`/apps/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        token: token ?? undefined,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      setEditingApp(null);
    },
  });

  const regenerateKeyMu = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api<{ apiKey: string }>(`/apps/${id}/regenerate-api-key`, {
        method: 'POST',
        token: token ?? undefined,
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      if (data.apiKey) {
        setEditingApp(null);
        setCreatedApiKey(data.apiKey);
      }
    },
  });

  return (
    <div>
      <h1 className="display-title mb-4 text-2xl font-bold text-[var(--sea-ink)]">Apps</h1>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-[var(--lagoon-deep)] px-4 py-2 text-sm font-medium text-white">
          Create app
        </button>
      </div>
      <div className="island-shell rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface)]">
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">Name</th>
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">App ID</th>
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">Instance</th>
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">Active</th>
              <th className="p-3 text-right font-semibold text-[var(--sea-ink)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((app) => (
              <tr key={app.id} className="border-b border-[var(--line)]">
                <td className="p-3">{app.name}</td>
                <td className="p-3 font-mono text-xs">{app.appId}</td>
                <td className="p-3">{instanceById[app.instanceId] ?? app.instanceId}</td>
                <td className="p-3">{app.isActive ? 'Yes' : 'No'}</td>
                <td className="p-3 text-right">
                  <button
                    type="button"
                    onClick={() => setEditingApp(app)}
                    className="rounded bg-[var(--lagoon-deep)] px-2 py-1 text-xs font-medium text-white hover:opacity-90">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateAppModal
          instances={instances}
          onClose={() => setShowCreate(false)}
          onSubmit={(body) => createMu.mutate(body)}
          loading={createMu.isPending}
        />
      )}

      {editingApp && (
        <EditAppModal
          app={editingApp}
          instances={instances}
          onClose={() => setEditingApp(null)}
          onSave={(body) => updateMu.mutate({ id: editingApp.id, body })}
          onRegenerateKey={() => regenerateKeyMu.mutate(editingApp.id)}
          loading={updateMu.isPending}
          regenerating={regenerateKeyMu.isPending}
        />
      )}

      {createdApiKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setCreatedApiKey(null)}>
          <div
            className="island-shell w-lg max-w-lg rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-lg font-semibold text-[var(--sea-ink)]">
              API Key (copy once)
            </h2>
            <p className="mb-2 text-sm text-[var(--sea-ink-soft)]">
              Use this as the <code className="rounded bg-[var(--line)] px-1">x-api-key</code>{' '}
              header. It won&apos;t be shown again.
            </p>
            <pre className="mb-4 break-all rounded bg-[var(--foam)] p-3 text-xs">
              {createdApiKey}
            </pre>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(createdApiKey);
              }}
              className="rounded-lg bg-[var(--lagoon-deep)] px-4 py-2 text-sm text-white">
              Copy
            </button>
            <button
              type="button"
              onClick={() => setCreatedApiKey(null)}
              className="ml-2 rounded-lg border border-[var(--line)] px-4 py-2 text-sm">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditAppModal({
  app,
  instances,
  onClose,
  onSave,
  onRegenerateKey,
  loading,
  regenerating,
}: {
  app: App;
  instances: Instance[];
  onClose: () => void;
  onSave: (body: { instanceId?: number; isActive?: number }) => void;
  onRegenerateKey: () => void;
  loading: boolean;
  regenerating: boolean;
}) {
  const [instanceId, setInstanceId] = useState(app.instanceId);
  const [isActive, setIsActive] = useState(app.isActive);

  const hasChanges = instanceId !== app.instanceId || isActive !== app.isActive;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}>
      <div className="island-shell max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-[var(--sea-ink)]">Edit app</h2>
        <p className="mb-3 text-sm text-[var(--sea-ink-soft)]">{app.name}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-[var(--sea-ink)]">Instance</label>
            <select
              value={instanceId}
              onChange={(e) => setInstanceId(Number(e.target.value))}
              className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--sea-ink)]">Active</label>
            <select
              value={isActive}
              onChange={(e) => setIsActive(Number(e.target.value) as 0 | 1)}
              className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
              <option value={1}>Yes</option>
              <option value={0}>No</option>
            </select>
          </div>
          <div className="border-t border-[var(--line)] pt-3">
            <label className="block text-sm font-medium text-[var(--sea-ink)]">API Key</label>
            <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
              Regenerating will invalidate the current key. The new key is shown once.
            </p>
            <button
              type="button"
              onClick={onRegenerateKey}
              disabled={regenerating}
              className="mt-2 rounded-lg border border-amber-600 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50">
              {regenerating ? 'Regenerating…' : 'Regenerate API key'}
            </button>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onSave({ instanceId, isActive })}
            disabled={!hasChanges || loading}
            className="rounded-lg bg-[var(--lagoon-deep)] px-4 py-2 text-sm text-white disabled:opacity-50">
            {loading ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateAppModal({
  instances,
  onClose,
  onSubmit,
  loading,
}: {
  instances: Instance[];
  onClose: () => void;
  onSubmit: (body: { name: string; description?: string; instanceId: number }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instanceId, setInstanceId] = useState(instances[0]?.id ?? 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}>
      <div
        className="island-shell w-md max-w-md rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-[var(--sea-ink)]">Create app</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-[var(--sea-ink)]">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--sea-ink)]">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--sea-ink)]">Instance</label>
            <select
              value={instanceId}
              onChange={(e) => setInstanceId(Number(e.target.value))}
              className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onSubmit({ name, description: description || undefined, instanceId })}
            disabled={!name || loading}
            className="rounded-lg bg-[var(--lagoon-deep)] px-4 py-2 text-sm text-white disabled:opacity-50">
            {loading ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
