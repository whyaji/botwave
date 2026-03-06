import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { api, getWsUrl } from '@/lib/api';
import { flare } from '@/lib/utils/flare';
import { getToken } from '@/stores/auth';

export const Route = createFileRoute('/_dashboard/instances')({
  component: InstancesPage,
});

type Instance = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  lastConnectedAt: string | null;
  createdAt: string;
};

type Group = {
  id: string;
  name: string;
};

function InstancesPage() {
  const queryClient = useQueryClient();
  const token = getToken();
  const { data: list = [], isLoading } = useQuery({
    queryKey: ['instances'],
    queryFn: async () => {
      const { data } = await api<Instance[]>('/instances', { token: token ?? undefined });
      return Array.isArray(data) ? data : [];
    },
  });

  const connectMu = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api<Instance>(`/instances/${id}/connect`, {
        method: 'POST',
        token: token ?? undefined,
      });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['instances'] }),
  });

  const disconnectMu = useMutation({
    mutationFn: async (id: number) => {
      await api(`/instances/${id}/disconnect`, {
        method: 'POST',
        token: token ?? undefined,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['instances'] }),
  });

  const createMu = useMutation({
    mutationFn: async (body: { name: string; description?: string }) => {
      const { data } = await api<Instance>('/instances', {
        method: 'POST',
        body: JSON.stringify(body),
        token: token ?? undefined,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] });
      setShowCreate(false);
    },
  });

  const [connectModal, setConnectModal] = useState<number | null>(null);
  const [groupsModal, setGroupsModal] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<string>('');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (connectModal == null || !token) return;
    connectMu.mutate(connectModal);
    const url = getWsUrl(connectModal, token);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === 'qr') setQr(msg.qr ?? null);
        if (msg.type === 'status') setWsStatus(msg.status ?? '');
        if (msg.type === 'connected') {
          setWsStatus('connected');
          setQr(null);
          queryClient.invalidateQueries({ queryKey: ['instances'] });
        }
      } catch {
        flare('Failed to parse WebSocket message', { variant: 'error' });
      }
    };
    ws.onclose = () => setWsStatus('closed');
    return () => {
      ws.close();
      wsRef.current = null;
      setQr(null);
      setWsStatus('');
    };
    // Intentionally omit connectMu: it changes when mutation state updates (e.g. after
    // onSuccess), which would re-run this effect, close the WebSocket, and open a new one,
    // causing ECONNABORTED and repeated backend connect/disconnect.
  }, [connectModal, token, queryClient]);

  return (
    <div>
      <h1 className="display-title mb-4 text-2xl font-bold text-[var(--sea-ink)]">Instances</h1>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-[var(--lagoon-deep)] px-4 py-2 text-sm font-medium text-white">
          New instance
        </button>
      </div>
      <div className="island-shell rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface)]">
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">Name</th>
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">Status</th>
              <th className="p-3 text-left font-semibold text-[var(--sea-ink)]">Last connected</th>
              <th className="p-3 text-right font-semibold text-[var(--sea-ink)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-[var(--sea-ink-soft)]">
                  Loading…
                </td>
              </tr>
            ) : (
              list.map((inst) => (
                <tr key={inst.id} className="border-b border-[var(--line)]">
                  <td className="p-3">{inst.name}</td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        inst.status === 'connected'
                          ? 'bg-green-100 text-green-800'
                          : inst.status === 'qr_required'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-700'
                      }`}>
                      {inst.status}
                    </span>
                  </td>
                  <td className="p-3 text-[var(--sea-ink-soft)]">
                    {inst.lastConnectedAt ? new Date(inst.lastConnectedAt).toLocaleString() : '—'}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {inst.status === 'connected' && (
                        <button
                          type="button"
                          onClick={() => setGroupsModal(inst.id)}
                          className="rounded bg-[var(--lagoon-deep)] px-2 py-1 text-xs font-medium text-white hover:opacity-90">
                          Groups
                        </button>
                      )}
                      {inst.status === 'connected' ? (
                        <button
                          type="button"
                          onClick={() => disconnectMu.mutate(inst.id)}
                          className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200">
                          Disconnect
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConnectModal(inst.id)}
                          className="rounded bg-[var(--lagoon-deep)] px-2 py-1 text-xs font-medium text-white hover:opacity-90">
                          Connect
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateInstanceModal
          onClose={() => setShowCreate(false)}
          onSubmit={(body) => createMu.mutate(body)}
          loading={createMu.isPending}
        />
      )}

      {connectModal != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setConnectModal(null)}>
          <div
            className="island-shell max-w-sm rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-[var(--sea-ink)]">Scan QR code</h2>
            <p className="mb-2 text-sm text-[var(--sea-ink-soft)]">{wsStatus || 'Connecting…'}</p>
            {qr ? (
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qr)}`}
                alt="QR Code"
                className="mx-auto rounded-lg"
              />
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg bg-[var(--foam)] text-[var(--sea-ink-soft)]">
                {wsStatus === 'connected' ? 'Connected!' : 'Waiting for QR…'}
              </div>
            )}
            <button
              type="button"
              onClick={() => setConnectModal(null)}
              className="mt-4 w-full rounded-lg border border-[var(--line)] py-2 text-sm">
              Close
            </button>
          </div>
        </div>
      )}

      {groupsModal != null && (
        <GroupsModal
          instanceId={groupsModal}
          onClose={() => setGroupsModal(null)}
          token={token ?? undefined}
          onInstanceDisconnected={() => queryClient.invalidateQueries({ queryKey: ['instances'] })}
        />
      )}
    </div>
  );
}

function GroupsModal({
  instanceId,
  onClose,
  token,
  onInstanceDisconnected,
}: {
  instanceId: number;
  onClose: () => void;
  token?: string;
  onInstanceDisconnected?: () => void;
}) {
  const [groupSearch, setGroupSearch] = useState('');
  const {
    data: groups = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['instances', instanceId, 'groups'],
    queryFn: async () => {
      const { data } = await api<Group[]>(`/instances/${instanceId}/groups`, {
        token,
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!token,
  });

  const searchLower = groupSearch.trim().toLowerCase();
  const filteredGroups =
    searchLower === ''
      ? groups
      : groups.filter(
          (g) =>
            g.name.toLowerCase().includes(searchLower) || g.id.toLowerCase().includes(searchLower)
        );

  useEffect(() => {
    if (!error || !onInstanceDisconnected) return;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('no longer connected') || msg.includes('Please connect again')) {
      onInstanceDisconnected?.();
    }
  }, [error]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}>
      <div
        className="island-shell max-w-lg w-full max-h-[80vh] rounded-2xl p-6 flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-[var(--sea-ink)]">Groups</h2>
        {!isLoading && !error && groups.length > 0 && (
          <div className="mb-4">
            <input
              type="search"
              placeholder="Search by name or ID…"
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm placeholder:text-[var(--sea-ink-soft)]"
              aria-label="Search groups"
            />
          </div>
        )}
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-8 text-[var(--sea-ink-soft)]">
            Loading groups…
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <p className="text-red-600">
              {error instanceof Error ? error.message : 'Failed to load groups'}
            </p>
            {(error instanceof Error ? error.message : '').includes('no longer connected') && (
              <p className="mt-3 text-sm text-[var(--sea-ink-soft)]">
                Close this dialog, then use <strong>Connect</strong> for this instance and try
                Groups again.
              </p>
            )}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-8 text-[var(--sea-ink-soft)]">
            No groups found
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-8 text-[var(--sea-ink-soft)]">
            No groups match your search
          </div>
        ) : (
          <div className="groups-modal-scroll flex-1 overflow-y-auto space-y-3 pr-2">
            {filteredGroups.map((group) => (
              <div
                key={group.id}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <p className="font-medium text-[var(--sea-ink)]">{group.name}</p>
                <p className="mt-1 text-xs text-[var(--sea-ink-soft)] font-mono break-all">
                  {group.id}
                </p>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg border border-[var(--line)] py-2 text-sm">
          Close
        </button>
      </div>
    </div>
  );
}

function CreateInstanceModal({
  onClose,
  onSubmit,
  loading,
}: {
  onClose: () => void;
  onSubmit: (body: { name: string; description?: string }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}>
      <div className="island-shell max-w-sm rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-[var(--sea-ink)]">New instance</h2>
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
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onSubmit({ name, description: description || undefined })}
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
