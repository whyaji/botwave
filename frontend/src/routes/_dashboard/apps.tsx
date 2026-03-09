import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
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
  commandAllowedGroups?: string[] | null;
  commandAllowedUsers?: string[] | null;
  commandWebHook?: string | null;
  commandList?: string[] | null;
};

type Instance = { id: number; name: string };

type Group = { id: string; name: string };

type CreateAppBody = {
  name: string;
  description?: string;
  instanceId: number;
  commandAllowedGroups?: string[];
  commandAllowedUsers?: string[];
  commandWebHook?: string;
  commandList?: string[];
};

type UpdateAppBody = {
  instanceId?: number;
  isActive?: number;
  commandAllowedGroups?: string[];
  commandAllowedUsers?: string[];
  commandWebHook?: string | null;
  commandList?: string[];
};

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
    mutationFn: async (body: CreateAppBody) => {
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
    mutationFn: async ({ id, body }: { id: number; body: UpdateAppBody }) => {
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

function CommandAllowedGroupsField({
  instanceId,
  groups,
  groupsLoading,
  value,
  onChange,
}: {
  instanceId: number;
  groups: Group[];
  groupsLoading: boolean;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.trim().toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q));
  }, [groups, search]);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  };

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[var(--sea-ink)]">
        Command allowed groups
      </label>
      <p className="mb-1.5 text-xs text-[var(--sea-ink-soft)]">
        Select instance first. Only groups from that instance are listed.
      </p>
      {!instanceId ? (
        <p className="rounded-md border border-[var(--line)] bg-[var(--foam)] px-3 py-2 text-sm text-[var(--sea-ink-soft)]">
          Select an instance above to load groups.
        </p>
      ) : groupsLoading ? (
        <p className="rounded-md border border-[var(--line)] bg-[var(--foam)] px-3 py-2 text-sm text-[var(--sea-ink-soft)]">
          Loading groups…
        </p>
      ) : (
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] shadow-xs">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups..."
            className="w-full border-b border-[var(--line)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--sea-ink-soft)] focus:outline-none focus:ring-0"
          />
          <div className="groups-modal-scroll max-h-40 overflow-y-auto p-1 pr-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-[var(--sea-ink-soft)]">
                No groups found.
              </p>
            ) : (
              filtered.map((g) => (
                <label
                  key={g.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--foam)]',
                    value.includes(g.id) && 'bg-[var(--hero-a)]'
                  )}>
                  <input
                    type="checkbox"
                    checked={value.includes(g.id)}
                    onChange={() => toggle(g.id)}
                    className="h-4 w-4 rounded border-[var(--line)] text-[var(--lagoon-deep)] focus:ring-2 focus:ring-[var(--lagoon-deep)]"
                  />
                  <span className="truncate">{g.name}</span>
                  <span className="shrink-0 font-mono text-xs text-[var(--sea-ink-soft)]">
                    {g.id}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CommandAllowedUsersField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const add = () => onChange([...value, '']);
  const setOne = (i: number, v: string) => {
    const next = [...value];
    next[i] = v.replace(/\D/g, '');
    onChange(next);
  };
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[var(--sea-ink)]">
        Command allowed users (phone numbers)
      </label>
      <div className="space-y-2">
        {value.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="tel"
              inputMode="numeric"
              value={v}
              onChange={(e) => setOne(i, e.target.value)}
              placeholder="e.g. 6281234567890"
              className="flex h-9 flex-1 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm shadow-xs placeholder:text-[var(--sea-ink-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lagoon-deep)]"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded-md border border-[var(--line)] px-2 text-sm text-[var(--sea-ink-soft)] hover:bg-[var(--foam)]">
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="rounded-md border border-dashed border-[var(--line)] px-3 py-1.5 text-sm text-[var(--sea-ink-soft)] hover:bg-[var(--foam)]">
          Add number
        </button>
      </div>
    </div>
  );
}

function CommandListField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const add = () => onChange([...value, '']);
  const setOne = (i: number, v: string) => {
    const next = [...value];
    next[i] = v;
    onChange(next);
  };
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[var(--sea-ink)]">Command list</label>
      <div className="space-y-2">
        {value.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="text"
              value={v}
              onChange={(e) => setOne(i, e.target.value)}
              placeholder="e.g. !start"
              className="flex h-9 flex-1 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm shadow-xs placeholder:text-[var(--sea-ink-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lagoon-deep)]"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded-md border border-[var(--line)] px-2 text-sm text-[var(--sea-ink-soft)] hover:bg-[var(--foam)]">
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="rounded-md border border-dashed border-[var(--line)] px-3 py-1.5 text-sm text-[var(--sea-ink-soft)] hover:bg-[var(--foam)]">
          Add command
        </button>
      </div>
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
  onSave: (body: UpdateAppBody) => void;
  onRegenerateKey: () => void;
  loading: boolean;
  regenerating: boolean;
}) {
  const token = getToken();
  const [instanceId, setInstanceId] = useState(app.instanceId);
  const [isActive, setIsActive] = useState(app.isActive);
  const [commandAllowedGroups, setCommandAllowedGroups] = useState<string[]>(
    app.commandAllowedGroups ?? []
  );
  const [commandAllowedUsers, setCommandAllowedUsers] = useState<string[]>(
    app.commandAllowedUsers ?? []
  );
  const [commandWebHook, setCommandWebHook] = useState(app.commandWebHook ?? '');
  const [commandList, setCommandList] = useState<string[]>(app.commandList ?? []);

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['instances', instanceId, 'groups'],
    queryFn: async () => {
      const { data } = await api<Group[]>(`/instances/${instanceId}/groups`, {
        token: token ?? undefined,
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!instanceId,
  });

  const hasChanges =
    instanceId !== app.instanceId ||
    isActive !== app.isActive ||
    JSON.stringify(commandAllowedGroups.slice().sort()) !==
      JSON.stringify((app.commandAllowedGroups ?? []).slice().sort()) ||
    JSON.stringify(commandAllowedUsers) !== JSON.stringify(app.commandAllowedUsers ?? []) ||
    (commandWebHook || '') !== (app.commandWebHook || '') ||
    JSON.stringify(commandList) !== JSON.stringify(app.commandList ?? []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}>
      <div
        className="island-shell max-w-lg max-h-[90vh] flex flex-col rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}>
        <div className="groups-modal-scroll flex-1 overflow-y-auto pr-2">
          <h2 className="mb-4 text-lg font-semibold text-[var(--sea-ink)]">Edit app</h2>
          <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">{app.name}</p>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--sea-ink)]">
                Instance
              </label>
              <select
                value={instanceId}
                onChange={(e) => setInstanceId(Number(e.target.value))}
                className="flex h-9 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-[var(--sea-ink-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lagoon-deep)]">
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--sea-ink)]">
                Active
              </label>
              <select
                value={isActive}
                onChange={(e) => setIsActive(Number(e.target.value) as 0 | 1)}
                className="flex h-9 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lagoon-deep)]">
                <option value={1}>Yes</option>
                <option value={0}>No</option>
              </select>
            </div>

            <CommandAllowedGroupsField
              instanceId={instanceId}
              groups={groups}
              groupsLoading={groupsLoading}
              value={commandAllowedGroups}
              onChange={setCommandAllowedGroups}
            />
            <CommandAllowedUsersField
              value={commandAllowedUsers}
              onChange={setCommandAllowedUsers}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--sea-ink)]">
                Command webhook URL
              </label>
              <input
                type="url"
                value={commandWebHook}
                onChange={(e) => setCommandWebHook(e.target.value)}
                placeholder="https://..."
                className="flex h-9 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm shadow-xs placeholder:text-[var(--sea-ink-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lagoon-deep)]"
              />
            </div>
            <CommandListField value={commandList} onChange={setCommandList} />

            <div className="border-t border-[var(--line)] pt-4">
              <label className="block text-sm font-medium text-[var(--sea-ink)]">API Key</label>
              <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
                Regenerating will invalidate the current key. The new key is shown once.
              </p>
              <button
                type="button"
                onClick={onRegenerateKey}
                disabled={regenerating}
                className="mt-2 rounded-md border border-amber-600 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                {regenerating ? 'Regenerating…' : 'Regenerate API key'}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-6 flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() =>
              onSave({
                instanceId,
                isActive,
                commandAllowedGroups,
                commandAllowedUsers,
                commandWebHook: commandWebHook || null,
                commandList,
              })
            }
            disabled={!hasChanges || loading}
            className="rounded-md bg-[var(--lagoon-deep)] px-4 py-2 text-sm font-medium text-white shadow-xs hover:opacity-90 disabled:opacity-50">
            {loading ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--foam)]">
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
  onSubmit: (body: CreateAppBody) => void;
  loading: boolean;
}) {
  const token = getToken();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instanceId, setInstanceId] = useState(instances[0]?.id ?? 0);
  const [commandAllowedGroups, setCommandAllowedGroups] = useState<string[]>([]);
  const [commandAllowedUsers, setCommandAllowedUsers] = useState<string[]>([]);
  const [commandWebHook, setCommandWebHook] = useState('');
  const [commandList, setCommandList] = useState<string[]>([]);

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['instances', instanceId, 'groups'],
    queryFn: async () => {
      const { data } = await api<Group[]>(`/instances/${instanceId}/groups`, {
        token: token ?? undefined,
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!instanceId,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}>
      <div
        className="island-shell max-w-lg max-h-[90vh] flex flex-col rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}>
        <div className="groups-modal-scroll flex-1 overflow-y-auto pr-2">
          <h2 className="mb-4 text-lg font-semibold text-[var(--sea-ink)]">Create app</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--sea-ink)]">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex h-9 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm shadow-xs placeholder:text-[var(--sea-ink-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lagoon-deep)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--sea-ink)]">
                Description
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flex h-9 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm shadow-xs placeholder:text-[var(--sea-ink-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lagoon-deep)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--sea-ink)]">
                Instance
              </label>
              <select
                value={instanceId}
                onChange={(e) => setInstanceId(Number(e.target.value))}
                className="flex h-9 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lagoon-deep)]">
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>

            <CommandAllowedGroupsField
              instanceId={instanceId}
              groups={groups}
              groupsLoading={groupsLoading}
              value={commandAllowedGroups}
              onChange={setCommandAllowedGroups}
            />
            <CommandAllowedUsersField
              value={commandAllowedUsers}
              onChange={setCommandAllowedUsers}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--sea-ink)]">
                Command webhook URL
              </label>
              <input
                type="url"
                value={commandWebHook}
                onChange={(e) => setCommandWebHook(e.target.value)}
                placeholder="https://..."
                className="flex h-9 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm shadow-xs placeholder:text-[var(--sea-ink-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lagoon-deep)]"
              />
            </div>
            <CommandListField value={commandList} onChange={setCommandList} />
          </div>
        </div>
        <div className="mt-6 flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() =>
              onSubmit({
                name,
                description: description || undefined,
                instanceId,
                commandAllowedGroups: commandAllowedGroups.length
                  ? commandAllowedGroups
                  : undefined,
                commandAllowedUsers: commandAllowedUsers.filter(Boolean).length
                  ? commandAllowedUsers.filter(Boolean)
                  : undefined,
                commandWebHook: commandWebHook.trim() || undefined,
                commandList: commandList.filter(Boolean).length
                  ? commandList.filter(Boolean)
                  : undefined,
              })
            }
            disabled={!name || loading}
            className="rounded-md bg-[var(--lagoon-deep)] px-4 py-2 text-sm font-medium text-white shadow-xs hover:opacity-90 disabled:opacity-50">
            {loading ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--foam)]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
