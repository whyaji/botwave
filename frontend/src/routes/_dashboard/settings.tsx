import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { flare } from '@/lib/utils/flare';
import { getToken } from '@/stores/auth';

export const Route = createFileRoute('/_dashboard/settings')({
  component: SettingsPage,
});

type Setting = {
  id: number;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
};

function SettingsPage() {
  const queryClient = useQueryClient();
  const token = getToken();

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await api<Setting[]>('/settings', { token: token ?? undefined });
      return Array.isArray(data) ? data : [];
    },
  });

  const updateSettingMu = useMutation({
    mutationFn: async (payload: { key: string; value: string }) => {
      const { data } = await api<Setting>('/settings', {
        method: 'POST',
        body: JSON.stringify(payload),
        token: token ?? undefined,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      flare('Setting saved successfully', { variant: 'success' });
    },
    onError: (err) => {
      flare(err instanceof Error ? err.message : 'Failed to save setting', { variant: 'error' });
    },
  });

  // Local state for settings form
  const [delaySeconds, setDelaySeconds] = useState('');
  const [inactiveSchedule, setInactiveSchedule] = useState('');

  useEffect(() => {
    if (list.length > 0) {
      const delaySetting = list.find((s) => s.key === 'DELAY_SENDING_SECONDS');
      const scheduleSetting = list.find((s) => s.key === 'INACTIVE_SCHEDULED');

      if (delaySetting) setDelaySeconds(delaySetting.value);
      if (scheduleSetting) setInactiveSchedule(scheduleSetting.value);
    }
  }, [list]);

  const handleSaveDelay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!delaySeconds.trim() || Number.isNaN(Number(delaySeconds))) {
      flare('Please enter a valid number of seconds', { variant: 'error' });
      return;
    }
    updateSettingMu.mutate({ key: 'DELAY_SENDING_SECONDS', value: delaySeconds.trim() });
  };

  const handleSaveSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    const val = inactiveSchedule.trim();

    // Basic format validation if not empty: HH:mm-HH:mm,HH:mm-HH:mm
    if (val) {
      const parts = val.split(',');
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      for (const part of parts) {
        const times = part.trim().split('-');
        if (times.length !== 2 || !timeRegex.test(times[0]!) || !timeRegex.test(times[1]!)) {
          flare('Invalid schedule format. Expected HH:mm-HH:mm comma-separated list.', {
            variant: 'error',
          });
          return;
        }
      }
    }

    updateSettingMu.mutate({ key: 'INACTIVE_SCHEDULED', value: val });
  };

  return (
    <div className="max-w-xl">
      <h1 className="display-title mb-6 text-2xl font-bold text-[var(--sea-ink)]">
        System Settings
      </h1>

      {isLoading ? (
        <div className="text-[var(--sea-ink-soft)] text-sm">Loading settings…</div>
      ) : (
        <div className="space-y-6">
          {/* Sending Delay Card */}
          <div className="island-shell rounded-xl p-6 bg-[var(--surface)] border border-[var(--line)] shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--sea-ink)] mb-1">Sending Delay</h2>
            <p className="text-sm text-[var(--sea-ink-soft)] mb-4">
              Configures the delay interval between sent WhatsApp messages in seconds.
            </p>
            <form onSubmit={handleSaveDelay} className="flex gap-3 items-end">
              <div className="flex-1 max-w-[150px]">
                <label className="block text-xs font-medium text-[var(--sea-ink-soft)] mb-1">
                  Seconds
                </label>
                <input
                  type="number"
                  min="0"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] focus:outline-none focus:border-[var(--lagoon-deep)]"
                  placeholder="e.g. 15"
                />
              </div>
              <button
                type="submit"
                disabled={updateSettingMu.isPending}
                className="rounded-lg bg-[var(--lagoon-deep)] hover:opacity-90 transition px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {updateSettingMu.isPending ? 'Saving…' : 'Save'}
              </button>
            </form>
          </div>

          {/* Inactive Schedule Card */}
          <div className="island-shell rounded-xl p-6 bg-[var(--surface)] border border-[var(--line)] shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--sea-ink)] mb-1">Inactive Schedule</h2>
            <p className="text-sm text-[var(--sea-ink-soft)] mb-4">
              Define scheduled periods during which all instances will automatically stop to save
              memory. Use comma-separated list of `HH:mm-HH:mm` ranges.
            </p>
            <form onSubmit={handleSaveSchedule} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--sea-ink-soft)] mb-1">
                  Ranges (Local Time)
                </label>
                <input
                  type="text"
                  value={inactiveSchedule}
                  onChange={(e) => setInactiveSchedule(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] focus:outline-none focus:border-[var(--lagoon-deep)]"
                  placeholder="e.g. 00:00-04:00,17:40-18:00"
                />
                <span className="block text-[11px] text-[var(--sea-ink-soft)] mt-1 font-mono">
                  Example: 00:00-04:00,12:00-13:00 (multiple ranges separated by comma)
                </span>
              </div>
              <button
                type="submit"
                disabled={updateSettingMu.isPending}
                className="rounded-lg bg-[var(--lagoon-deep)] hover:opacity-90 transition px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {updateSettingMu.isPending ? 'Saving…' : 'Save'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
